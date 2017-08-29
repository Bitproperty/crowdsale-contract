var ADXToken = artifacts.require("./ADXToken.sol");
var Promise = require('bluebird')
var time = require('../helpers/time')

var startPrice = 1170 * 10000;

contract('ADXToken', function(accounts) {

  var crowdsale;

  var EXPECT_FOR_ONE_ETH = 11700000; // 900*1.3*10000

  var ownerAddr = web3.eth.accounts[0];
  var adexTeamAddr = web3.eth.accounts[9];
  var adexFundAddr = web3.eth.accounts[8];

  var participiants = web3.eth.accounts.slice(2, 8).map(account => {
    return {
      account: account,
      sent: web3.toWei(35, 'ether')
    }
  })

  var blockchainDate = function() {
    return web3.eth.getBlock(web3.eth.blockNumber).timestamp
  }

  var newSC = function(startDate) {
    return ADXToken.new(
      ownerAddr, // multisig
      adexTeamAddr, // team, whre 2% wings and 2% bounty will be received
      startDate, // public sale start
      startDate-7*24*60*60, // private sale start
      web3.toWei(40, 'ether'), // ETH hard cap, in wei
      web3.eth.accounts[0], 5047335,
      web3.eth.accounts[1], 5047335, // TODO: change accordingly
      web3.eth.accounts[2], 2340000
    )
  }

  it("initialize contract", function() {
    return newSC(blockchainDate()).then(function() { // ugly hack to get latest block (+timestamp) updated :( )
      var startDate = blockchainDate()
      return newSC(startDate)
    })
    .then(function(_crowdsale) {
      crowdsale = _crowdsale
    })
  });

  it("should start with 0 eth", function() {
    return crowdsale.etherRaised.call()
    .then(function(eth) {
      assert.equal(eth.valueOf(), 0);
    })
  });

  function testExchange(idx, price) {
    return () => {
      const currentParticipiants = [participiants[idx]]

      return Promise.all(currentParticipiants.map(participiant => {
        return new Promise((resolve, reject) => {
          web3.eth.sendTransaction({
            from: participiant.account,
            to: crowdsale.address,
            value: web3.toWei(1, 'ether'), //participiant.sent,
            gas: 130000
          }, (err) => {
            if (err) reject(err) 
            
            crowdsale.balanceOf(participiant.account).then(function(res) {
              //console.log(res.valueOf(), price);
              assert.equal(res.valueOf(), price);
              resolve()
            }).catch(reject)

          })
        })
      }))
    }
  }

  function moveTime(t) {
    return () => {
      return new Promise((resolve, reject) => {
           web3.currentProvider.sendAsync({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [t],
            id: new Date().getTime()
          }, (err, result) => {
            err ? reject(err) : resolve()
          })
      })
    }
  }

  it('Should allow to send ETH in exchange of Tokens - first day', testExchange(0, EXPECT_FOR_ONE_ETH))

  it('Should allow to send ETH in exchange of Tokens - first day, again', testExchange(1, EXPECT_FOR_ONE_ETH))
  
  it('Change time to next day', moveTime(1*24*60*60 + 30))
  it('Should allow to send ETH in exchange of Tokens - second day', testExchange(2, EXPECT_FOR_ONE_ETH * 0.9))

  it('Change time to next day', moveTime(1*24*60*60 + 30))
  it('Should allow to send ETH in exchange of Tokens - third day', testExchange(3, EXPECT_FOR_ONE_ETH * 0.9 * 0.9))

  //it('Change time to next day', moveTime(1*24*60*60 + 30))
  //it('Should allow to send ETH in exchange of Tokens - fourth day', testExchange(5, EXPECT_FOR_ONE_ETH * 0.9 * 0.9 * 0.9))

  //it('Change time to next day', moveTime(1*24*60*60 + 30))
  //it('Should allow to send ETH in exchange of Tokens - fifth day', testExchange(5, EXPECT_FOR_ONE_ETH * 0.9 * 0.9 * 0.9 * 0.9))

  var day = 4;
  var amount = EXPECT_FOR_ONE_ETH;
  var lastPrice = EXPECT_FOR_ONE_ETH * 0.9 * 0.9 * 0.9;
  it('Change time to next day - skip transfers', moveTime(1 * 24*60*60));

  for ( ; day < 30; day++) {
      lastPrice = Math.floor((lastPrice * 9) / 10);
      amount += lastPrice;
      it('Change time to day ' + (day + 1) + ' of crowdsale', moveTime(1 * 24*60*60));
      it('Should allow to send ETH in exchange of Tokens - ' + (day + 1) +'th day', testExchange(1, amount));
  }

  it('Change time to end of crowdsale', moveTime(1*24*60*60 + 30))
  it("Should not allow to send ETH in exchange of Tokens after crowdsale end", function() {
      return testExchange(1, amount + lastPrice)()
    .then(function() { throw new Error('Cant be here'); })
    .catch(function(err) {
      assert.equal(err.message, 'VM Exception while processing transaction: invalid opcode');
    })
  })

});
