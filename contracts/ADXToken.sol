pragma solidity ^0.4.11;

// QUESTIONS FOR AUDITORS:
// - Considering we inherit from VestedToken, how much does that hit at our gas price?
// - Ensure max supply is 100,000,000
// - Ensure that even if not totalSupply is sold, tokens would still be transferrable after (we will up to totalSupply by creating adEx tokens)

// vesting: 365 days, 365 days / 4 vesting

import "../zeppelin-solidity/contracts/math/SafeMath.sol";
import "../zeppelin-solidity/contracts/token/VestedToken.sol";

contract ADXToken is VestedToken {
  //FIELDS
  string public name = "BitProperty";
  string public symbol = "BTP";
  uint public decimals = 3;

  // Multiplier for the decimals
  uint private constant DECIMALS = 1000;

  //Prices of BTP
  uint public constant PRICE_STANDARD    = 10000*DECIMALS; // BTP received per one ETH; MAX_SUPPLY / (valuation / ethPrice)

  uint public constant PRICE_PREBUY = 13350 * DECIMALS; // price for pre-buy

  uint public tokensForEthNow; // will be initialized to PRICE_STANDARD
  uint public priceUpdated; // will be initialized in constructor

  // BTP Token Limits
  uint public constant ALLOC_TEAM =           882977242*DECIMALS; // team + advisors + BTPCorp
  uint public constant ALLOC_CROWDSALE =     1000000000*DECIMALS;
  uint public constant ALLOC_PREBUY =        1017022758*DECIMALS; // total allocated for the pre-buy
  
  //ASSIGNED IN INITIALIZATION
  //Start and end times
  uint public publicStartTime; // Time in seconds public crowd fund starts.
  uint public privateStartTime; // Time in seconds when pre-buy can purchase up to 31250 ETH worth of ADX;
  uint public publicEndTime; // Time in seconds crowdsale ends
  uint public hardcapInEth;

  //Special Addresses
  address public multisigAddress; // Address to which all ether flows.
  address public adexTeamAddress; // Address to which ALLOC_TEAM, ALLOC_BOUNTIES, ALLOC_WINGS is (ultimately) sent to.
  address public ownerAddress; // Address of the contract owner. Can halt the crowdsale.
  address public preBuy1; // Address used by pre-buy

  //Running totals
  uint public etherRaised; // Total Ether raised.

  uint public BTPSold; // Not to exceed ALLOC_CROWDSALE
  uint public prebuyBTPSold; // Not to exceed ALLOC_PREBUY

  uint public totalSupply =  2900000000*DECIMALS;

  //booleans
  bool public halted; // halts the crowd sale if true.

  // MODIFIERS
  //Is currently in the period after the private start time and before the public start time.
  modifier is_pre_crowdfund_period() {
    if (now >= publicStartTime || now < privateStartTime) throw;
    _;
  }

  //Is currently the crowdfund period
  modifier is_crowdfund_period() {
    if (now < publicStartTime) throw;
    if (isCrowdfundCompleted()) throw;
    _;
  }

  // Is completed
  modifier is_crowdfund_completed() {
    if (!isCrowdfundCompleted()) throw;
    _;
  }
  function isCrowdfundCompleted() internal returns (bool) {
    if (now > publicEndTime || BTPSold >= ALLOC_CROWDSALE || etherRaised >= hardcapInEth) return true;
    return false;
  }

  //May only be called by the owner address
  modifier only_owner() {
    if (msg.sender != ownerAddress) throw;
    _;
  }

  //May only be called if the crowdfund has not been halted
  modifier is_not_halted() {
    if (halted) throw;
    _;
  }

  // EVENTS
  event PreBuy(uint _amount);
  event Buy(address indexed _recipient, uint _amount);

  // Initialization contract assigns address of crowdfund contract and end time.
  function ADXToken(
    address _multisig,
    address _adexTeam,
    uint _publicStartTime,
    uint _privateStartTime,
    uint _hardcapInEth,
    address _prebuy1
  ) {
    ownerAddress = msg.sender;
    publicStartTime = _publicStartTime;
    privateStartTime = _privateStartTime;
    publicEndTime = _publicStartTime + 30 days;
    multisigAddress = _multisig;
    adexTeamAddress = _adexTeam;

    hardcapInEth = _hardcapInEth;

    preBuy1 = _prebuy1;

    balances[adexTeamAddress] += ALLOC_TEAM;
    balances[ownerAddress] += ALLOC_PREBUY;
    balances[ownerAddress] += ALLOC_CROWDSALE;

    tokensForEthNow = PRICE_STANDARD;
    priceUpdated = _publicStartTime;
  }

  // Transfer amount of tokens from sender account to recipient.
  // Only callable after the crowd fund is completed
  function transfer(address _to, uint _value)
  {
    // no-op, allow even during crowdsale, in order to work around using grantVestedTokens() while in crowdsale
    //if (_to == msg.sender) return;
    if (!isCrowdfundCompleted()) throw;
    super.transfer(_to, _value);
  }

  // Transfer amount of tokens from a specified address to a recipient.
  // Transfer amount of tokens from sender account to recipient.
  function transferFrom(address _from, address _to, uint _value)
    is_crowdfund_completed
  {
    super.transferFrom(_from, _to, _value);
  }

  //constant function returns the current ADX price.
  function getPriceRate()
      internal
      returns (uint o_rate)
  {
      // pitfall: if nobody invests for 24 hours, it won't move with a 1 step for 24 hours rate
      //if (now-priceUpdated > 24 hours) {
      //   tokensForEthNow = (tokensForEthNow * 9) / 10;
      //   priceUpdated = now;
      //}

      if (publicStartTime < now && publicEndTime > now) {
        uint delta = SafeMath.div(SafeMath.sub(now, priceUpdated), 1 days);

      if (delta > 0) {
        for (uint256 i = 0; i < delta; i++)
          tokensForEthNow = (tokensForEthNow * 9) / 10;

        priceUpdated += delta * 1 days;
      }
    }

    return tokensForEthNow;
  }

  // calculates wmount of ADX we get, given the wei and the rates we've defined per 1 eth
  function calcAmount(uint _wei, uint _rate) 
    constant
    returns (uint) 
  {
    return SafeMath.div(SafeMath.mul(_wei, _rate), 1 ether);
  } 
  
  // Given the rate of a purchase and the remaining tokens in this tranche, it
  // will throw if the sale would take it past the limit of the tranche.
  // Returns `amount` in scope as the number of ADX tokens that it will purchase.
  function processPurchase(uint _rate, uint _remaining)
    internal
    returns (uint o_amount)
  {
    o_amount = calcAmount(msg.value, _rate);

    if (o_amount > _remaining) throw;
    if (!multisigAddress.send(msg.value)) throw;

    balances[ownerAddress] = balances[ownerAddress].sub(o_amount);
    balances[msg.sender] = balances[msg.sender].add(o_amount);

    etherRaised += msg.value;
  }

  //Special Function can only be called by pre-buy and only during the pre-crowdsale period.
  function preBuy()
    payable
    is_pre_crowdfund_period
    is_not_halted
  {
    if ( ! (msg.sender == preBuy1)) throw;
  
    uint amount = processPurchase(PRICE_PREBUY, SafeMath.sub(ALLOC_PREBUY, prebuyBTPSold));
    prebuyBTPSold += amount;

    PreBuy(amount);
  }

  //Default function called by sending Ether to this address with no arguments.
  //Results in creation of new ADX Tokens if transaction would not exceed hard limit of ADX Token.
  function()
    payable
    is_crowdfund_period
    is_not_halted
  {
    uint amount = processPurchase(getPriceRate(), SafeMath.sub(ALLOC_CROWDSALE, BTPSold));
    BTPSold += amount;

    Buy(msg.sender, amount);
  }

  //May be used by owner of contract to halt crowdsale and no longer except ether.
  function toggleHalt(bool _halted)
    only_owner
  {
    halted = _halted;
  }

  //failsafe drain
  function drain()
    only_owner
  {
    if (!ownerAddress.send(this.balance)) throw;
  }
}
