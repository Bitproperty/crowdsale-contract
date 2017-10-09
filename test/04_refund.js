var BTPToken = artifacts.require("./BTPToken.sol");
var Promise = require('bluebird')
var time = require('../helpers/time')


contract('BTPToken - refund', function(accounts) {

  var crowdsale;

  var EXPECT_FOR_ONE_ETH = 10000 * 1000;

  var ownerAddr = web3.eth.accounts[1];
  var adexTeamAddr = web3.eth.accounts[9];
  var adexFundAddr = web3.eth.accounts[8];
  var prebuyAddr = web3.eth.accounts[1]; // one of the pre-buy addresses


  var participiants = web3.eth.accounts.slice(3, 8).map(account => {
    return {
      account: account,
      sent: web3.toWei(0.1, 'ether')
    }
  })

  var blockchainDate = function() {
    return web3.eth.getBlock(web3.eth.blockNumber).timestamp
  }

  var newSC = function(startDate) {
    return BTPToken.new(
      ownerAddr, // multisig
      adexTeamAddr, // team, whre 2% wings and 2% bounty will be received
      startDate, // public sale start
      startDate-7*24*60*60, // private sale start
      web3.toWei(4, 'ether'), // ETH hard cap, in wei
      web3.toWei( 2, 'ether'), // minimum
      web3.eth.accounts[1]
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
      assert.equal(eth.toNumber(), 0);
    })
  });

  it('Should allow to send ETH in exchange of Tokens', () => {
    const currentParticipiants = participiants.slice(0, 3)

    return Promise.all(currentParticipiants.map(participiant => {
      return new Promise((resolve, reject) => {
        web3.eth.sendTransaction({
          from: participiant.account,
          to: crowdsale.address,
          value: participiant.sent,
          gas: 130000
        }, (err) => {
          if (err) reject(err) 
          
          crowdsale.balanceOf(participiant.account).then(function(res) {
            assert.equal(res.toNumber(), EXPECT_FOR_ONE_ETH/10);
            resolve()
          }).catch(reject)

        })
      })
    }))
  })

  it('Shouldnt allow to transfer tokens before end of crowdsale', () => {
    return crowdsale.transfer(web3.eth.accounts[4], 50, {
      from: web3.eth.accounts[5]
    }).then(() => {
      throw new Error('Cant be here')
    }).catch(err => {
      assert.equal(err.message, 'VM Exception while processing transaction: invalid opcode')
    }).then(() => {
      return Promise.join(
        crowdsale.balanceOf.call(web3.eth.accounts[4]),
        crowdsale.balanceOf.call(web3.eth.accounts[5]),
        (toBalance, fromBalance) => {
            assert.equal(toBalance.toNumber(), EXPECT_FOR_ONE_ETH/10)
            assert.equal(fromBalance.toNumber(), EXPECT_FOR_ONE_ETH/10)

        }
      )
    })
  })

  it('Change time to 40 days after crowdsale', () => {
    return new Promise((resolve, reject) => {
         web3.currentProvider.sendAsync({
          jsonrpc: "2.0",
          method: "evm_increaseTime",
          params: [40*24*60*60],
          id: new Date().getTime()
        }, (err, result) => {
          err? reject(err) : resolve()
        })
    })
  })

  it('Shouldnt allow to transfer tokens after end of crowdsale, because of minimum not reached', () => {
    return crowdsale.transfer(web3.eth.accounts[4], 50, {
      from: web3.eth.accounts[5]
    }).then(() => {
      throw new Error('Cant be here')
    }).catch(err => {
      assert.equal(err.message, 'VM Exception while processing transaction: invalid opcode')
    }).then(() => {
      return Promise.join(
        crowdsale.balanceOf.call(web3.eth.accounts[4]),
        crowdsale.balanceOf.call(web3.eth.accounts[5]),
        (toBalance, fromBalance) => {
            assert.equal(toBalance.toNumber(), EXPECT_FOR_ONE_ETH/10)
            assert.equal(fromBalance.toNumber(), EXPECT_FOR_ONE_ETH/10)

        }
      )
    })
  })

  // TODO should not be allowed to get a re-fund if it's another account
  // TODO: in the hard cap or crowdsale case: we should NOT be able to get a re-fund if minimum is 

  it('Should be allowed to get a re-fund', () => {
    var startBal = 0
    var gasUsed = 0 

    // we don't really care about etherRaised, just using it to chain
    return crowdsale.etherRaised.call()
    .then(function() { 
      return web3.eth.getBalance(web3.eth.accounts[4])
    })
    .then(function(st) {
      startBal = st.toNumber()
      return crowdsale.getRefund({ from: web3.eth.accounts[4], gasPrice: web3.toHex(10000000000) })
    })
    .then(function(res) {
       gasUsed += res.receipt.cumulativeGasUsed
       return web3.eth.getBalance(web3.eth.accounts[4])
    })
    .then(function(bal) {
      assert.equal(bal.toNumber() + (gasUsed * 10000000000), startBal + parseInt(web3.toWei(0.1, 'ether')))
    })
  })

});
