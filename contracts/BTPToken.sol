pragma solidity ^0.4.11;

import "../zeppelin-solidity/contracts/math/SafeMath.sol";
import "../zeppelin-solidity/contracts/token/VestedToken.sol";

contract BTPToken is VestedToken {
  // FIELDS
  string public name = "BitProperty";
  string public symbol = "BTP";
  uint public decimals = 3;

  // Multiplier for the decimals
  uint private constant DECIMALS = 1000;

  //Prices of BTP
  uint public constant PRICE_STANDARD     = 10000*DECIMALS; // BTP received per one ETH; MAX_SUPPLY / (valuation / ethPrice)

  uint public constant PRICE_PREBUY       = 13350*DECIMALS; // price for pre-buy

  uint public tokensForEthNow; // will be initialized to PRICE_STANDARD
  uint public priceUpdated; // will be initialized in constructor

  // BTP Token Limits
  uint public constant ALLOC_TEAM =          1382977242*DECIMALS; // team + advisors + BTPCorp
  uint public constant ALLOC_CROWDSALE =      500000000*DECIMALS;
  uint public constant ALLOC_PREBUY =        1017022758*DECIMALS; // total allocated for the pre-buy
  // sum should be 2900000000

  // Public, ERC20
  uint public totalSupply =  2900000000*DECIMALS;

  //ASSIGNED IN INITIALIZATION
  //Start and end times
  uint public publicStartTime; // Time in seconds public crowd fund starts.
  uint public privateStartTime; // Time in seconds when pre-buy can purchase up to ALLOC_PREBUY tokens
  uint public publicEndTime; // Time in seconds crowdsale ends
  uint public hardcapInEth;

  //Special Addresses
  address public multisigAddress; // Address to which all ether flows.
  address public teamAddress; // Address to which team tokens are allocated to
  address public ownerAddress; // Address of the contract owner. Can halt the crowdsale.
  address public preBuy1; // Address used by pre-buy

  //Running totals
  uint public etherRaised; // Total Ether raised.

  uint public BTPSold; // Not to exceed ALLOC_CROWDSALE
  uint public prebuyBTPSold; // Not to exceed ALLOC_PREBUY

  //booleans
  bool public halted; // halts the crowd sale if true.

  // MODIFIERS
  //Is currently in the period after the private start time and before the public start time.
  modifier is_pre_crowdfund_period() {
    require(now >= privateStartTime);
    require(now < publicStartTime);
    _;
  }

  //Is currently the crowdfund period
  modifier is_crowdfund_period() {
    require(now >= publicStartTime);
    require(!isCrowdfundCompleted());
    _;
  }

  // Is completed
  modifier is_crowdfund_completed() {
    require(isCrowdfundCompleted());
    _;
  }
  function isCrowdfundCompleted() internal returns (bool) {
    if (now > publicEndTime) return true; // out of time
    if (BTPSold >= ALLOC_CROWDSALE) return true; // out of tokens
    if (etherRaised >= hardcapInEth) return true; // hard cap reached
    return false;
  }

  //May only be called by the owner address
  modifier only_owner() {
    require(msg.sender == ownerAddress);
    _;
  }

  //May only be called if the TGE has not been halted
  modifier is_not_halted() {
    require(!halted);
    _;
  }

  // Initialization contract assigns address of token contract and end time.
  function BTPToken(
    address _multisig,
    address _team,
    uint _publicStartTime,
    uint _privateStartTime,
    uint _hardcapInEth,
    address _prebuy1
  ) {
    // sanity
    require(_publicStartTime > _privateStartTime);
    require(_multisig != 0);
    require(_team != 0);

    ownerAddress = msg.sender;
    publicStartTime = _publicStartTime;
    privateStartTime = _privateStartTime;
    publicEndTime = _publicStartTime + 30 days;
    multisigAddress = _multisig;
    teamAddress = _team;

    hardcapInEth = _hardcapInEth;

    preBuy1 = _prebuy1;

    balances[teamAddress] += ALLOC_TEAM;

    // All the tokens up for purchase will be allocated to the addr of the owner
    // when sold, they will be deducated (transferred) from the ownerADdress
    balances[ownerAddress] += ALLOC_PREBUY;
    balances[ownerAddress] += ALLOC_CROWDSALE;

    uint team_distributed_amount = 446890000*DECIMALS;
    balances[0x0062d19ab3bB1Ce0FaC5039bDEd552f6C1A2d839] += 133110000*DECIMALS;
    balances[0x3991d37B0E136304E870f0231b9C2865624f5c3C] += 86710000*DECIMALS;
    balances[0xC527E19E14f2599855F334845E74fA97bff6A988] += 29870000*DECIMALS;
    balances[0x79F4A85E31194deb723A39aA8d5CfDd6B6eDD319] += 29870000*DECIMALS;
    balances[0xf6c9da22ABA20c19b6D1D8e58311BCA50663096A] += 29870000*DECIMALS;
    balances[0x42809C60D9c329d16d6116cdDf97251CA92023cE] += 50460000*DECIMALS;
    balances[0x54433be563169BF2dB6309D6c675Ab3796f82Eb7] += 87000000*DECIMALS;
    balances[teamAddress] -= team_distributed_amount;

    tokensForEthNow = PRICE_STANDARD;
    priceUpdated = _publicStartTime;
  }

  // transfer() and transferFrom() are overriden so we can limit them to is_crowdfund_completed conditions

  // Transfer amount of tokens from sender account to recipient
  function transfer(address _to, uint _value)
    returns (bool)
  {
    // no-op, allow even during crowdsale, in order to work around using grantVestedTokens() while in crowdsale
    //if (_to == msg.sender) return;
    require(isCrowdfundCompleted());
    return super.transfer(_to, _value);
  }

  // Transfer amount of tokens from sender account to recipient.
  function transferFrom(address _from, address _to, uint _value)
    is_crowdfund_completed
    returns (bool)
  {
    return super.transferFrom(_from, _to, _value);
  }

  // NOTE: remove Bonus Rate
  //constant function returns the current token price.
  //function getPriceRate()
  //    internal
  //    returns (uint o_rate)
  //{
  //    // pitfall: if nobody invests for 24 hours, it won't move with a 1 step for 24 hours rate
  //    //if (now-priceUpdated > 24 hours) {
  //    //   tokensForEthNow = (tokensForEthNow * 9) / 10;
  //    //   priceUpdated = now;
  //    //}

  //  if (publicStartTime < now && publicEndTime > now) {
  //    uint delta = SafeMath.div(SafeMath.sub(now, priceUpdated), 1 days);

  //    if (delta > 0) {
  //      for (uint256 i = 0; i < delta; i++)
  //        tokensForEthNow = (tokensForEthNow * 9) / 10;

  //      priceUpdated += delta * 1 days;
  //    }
  //  }

  //  return tokensForEthNow;
  //}

  // calculates wmount of tokens we get, given the wei and the rates we've defined per 1 eth
  function calcAmount(uint _wei, uint _rate) 
    constant
    returns (uint) 
  {
    return SafeMath.div(SafeMath.mul(_wei, _rate), 1 ether);
  } 
  
  // Given the rate of a purchase and the remaining tokens in this tranche, it
  // will throw if the sale would take it past the limit of the tranche.
  // Returns `amount` in scope as the number of tokens that it will purchase.
  function processPurchase(uint _rate, uint _remaining)
    internal
    returns (uint o_amount)
  {
    o_amount = calcAmount(msg.value, _rate);

    require(o_amount <= _remaining);

    balances[ownerAddress] = balances[ownerAddress].sub(o_amount);
    balances[msg.sender] = balances[msg.sender].add(o_amount);

    require(multisigAddress.send(msg.value));
  }

  //Special Function can only be called by pre-buy and only during the pre-crowdsale period.
  function preBuy()
    payable
    is_pre_crowdfund_period
    is_not_halted
  {
    require(msg.sender == preBuy1);
  
    uint amount = processPurchase(PRICE_PREBUY, SafeMath.sub(ALLOC_PREBUY, prebuyBTPSold));
    prebuyBTPSold += amount;

    PreBuy(amount);
  }

  //Default function called by sending Ether to this address with no arguments.
  //Results in transfer of BTP from balances[owner] to the purchaser
  function()
    payable
    is_crowdfund_period
    is_not_halted
  {
    // Such increments should happen first; if processPurchase() fails (throws), it will not count
    etherRaised += msg.value;

    uint amount = processPurchase(tokensForEthNow, SafeMath.sub(ALLOC_CROWDSALE, BTPSold));
    BTPSold += amount;

    Buy(msg.sender, amount);
  }

  // Grant 6m vesting tokens, standard for the BTP token
  function grant6MVest(address _recepient, uint _amount) 
  {
    grantVestedTokens(
      _recepient, _amount,
      uint64(now), uint64(now), uint64(now + 182 days), 
      false, false // revokable, burns on revoke
    );
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
    require(ownerAddress.send(this.balance));
  }

  // ability to withdraw tokens accidently sent to the addr
  function withdrawToken(address tokenaddr) 
    only_owner 
  {
    ERC20 token = ERC20(tokenaddr);
    uint bal = token.balanceOf(address(this));
    token.transfer(msg.sender, bal);
  }


  // EVENTS
  event PreBuy(uint _amount);
  event Buy(address indexed _recipient, uint _amount);
}
