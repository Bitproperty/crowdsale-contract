var BTPToken = artifacts.require("./BTPToken.sol");
var Promise = require('bluebird')
var time = require('../helpers/time')

contract('BTPToken', function(accounts) {

  var crowdsale;

  var TOTAL = 2900000000
  var EXPECT_FOR_ONE_ETH = 10000 * 1000;
  var EXPECT_PREBUY = 13350 * 1000;

  var startDate;
  var ownerAddr = web3.eth.accounts[0];
  var adexTeamAddr1 = web3.eth.accounts[7]; // team
  var adexTeamAddr2 = web3.eth.accounts[8]; // this is going to be the address to which we grant vested tokens as a test
  var prebuyAddr = web3.eth.accounts[1]; 

  // accounts 4, 5
  var participiants = web3.eth.accounts.slice(3, 6).map(account => {
    return {
      account: account,
      sent: web3.toWei(1, 'ether')
    }
  })

  it("initialize contract", function() {
    return time.blockchainTime(web3)
    .then(function(startDate) {

      return BTPToken.new(
        ownerAddr, // multisig
        adexTeamAddr1, // team, where 30% tokens will be put 
        startDate+7*24*60*60, // public sale start
        startDate, // private sale start
        web3.toWei(100000, 'ether'), // ETH hard cap, in wei
        web3.toWei(     1, 'ether'), // minimum
        web3.eth.accounts[1]
      )
    }).then(function(_crowdsale) {
      crowdsale = _crowdsale
    })
  });

  it("should start with 0 eth", function() {
    return crowdsale.etherRaised.call()
    .then(function(eth) {
        assert.equal(eth.valueOf(), 0);
    })
  });


  it("totalSupply is right", function() {
    return crowdsale.totalSupply.call()
    .then(function(sup) {
        assert.equal(sup.valueOf(), TOTAL * 1000);
    })
  });

  it("pre-buy state: cannot send ETH in exchange for tokens", function() {
    return new Promise((resolve, reject) => {
        web3.eth.sendTransaction({
          from: prebuyAddr,
          to: crowdsale.address,
          value: web3.toWei(1, 'ether'),
          gas: 130000
        }, function(err, res) {
            if (!err) return reject(new Error('Cant be here'))
            assert.equal(err.message, 'VM Exception while processing transaction: invalid opcode')
            resolve()
        })
    })
  });

  it("pre-buy state: cannot send ETH in exchange for tokens from non-prebuy acc", function() {
    return new Promise((resolve, reject) => {
        crowdsale.preBuy({
          from: adexTeamAddr1,
          value: web3.toWei(1, 'ether'),
          gas: 130000
        }).catch((err) => {
            assert.equal(err.message, 'VM Exception while processing transaction: invalid opcode')
            resolve()
        })
    })
  });

  function preBuyTest(expected, eth, prebuyAddr) {
    return function() {
      var totalExpected = expected;
      var preBuyEth = eth;

      var start
      return time.blockchainTime(web3)
      .then(function(_start) {
        start = _start

        return crowdsale.preBuy({
          from: prebuyAddr,
          value: web3.toWei(preBuyEth, 'ether'),
          gas: 260000
        })
      })
      .then(() => {          
        return crowdsale.balanceOf(prebuyAddr)
      })
      .then((res) => {
          assert.equal(totalExpected, res.toNumber())
      })
    };
  }
  // TODO: simple pre-buy test
  it("pre-buy state: can pre-buy (addr1)", preBuyTest(EXPECT_PREBUY*2.5, 2.5, web3.eth.accounts[1]));

  it('Change time to crowdsale open', () => {
    return new Promise((resolve, reject) => {
         web3.currentProvider.sendAsync({
          jsonrpc: "2.0",
          method: "evm_increaseTime",
          params: [7*24*60*60 + 30],
          id: new Date().getTime()
        }, (err, result) => {
          err ? reject(err) : resolve()
        })
    })
  })

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
            assert.equal(res.valueOf(), EXPECT_FOR_ONE_ETH);
            resolve()
          })

        })
      })
    }))
  })

  // tokens not transferrable

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
            assert.equal(toBalance.valueOf(), EXPECT_FOR_ONE_ETH)
            assert.equal(fromBalance.valueOf(), EXPECT_FOR_ONE_ETH)

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

  it("should track raised eth", function() {
    return crowdsale.etherRaised.call()
    .then(function(eth) {
        // behaviour WAS changed to not count pre-buy money toward etherRaised
        //assert.equal(eth.valueOf(), web3.toWei(3, 'ether')); // 3 eth 

        // and then changed back again to count it towards
        assert.equal(eth.valueOf(), web3.toWei(2.5+3, 'ether')); // preBuy eth + 3 eth 
    })
  });

  // tokens transferable after end of crowdsale
  it('Should allow to transfer tokens after end of crowdsale', () => {
    return crowdsale.transfer(web3.eth.accounts[4], 50, {
      from: web3.eth.accounts[5]
    }).then(() => {
       return Promise.join(
        crowdsale.balanceOf.call(web3.eth.accounts[4]),
        crowdsale.balanceOf.call(web3.eth.accounts[5]),
        (toBalance, fromBalance) => {
            assert.equal(toBalance.valueOf(), EXPECT_FOR_ONE_ETH+50)
            assert.equal(fromBalance.valueOf(), EXPECT_FOR_ONE_ETH-50)
        }
      )
    })
  })


  // tokens transferable after end of crowdsale
  it('Should allow to unlock accidently sent tokens', () => {
    return crowdsale.transfer(crowdsale.address, 50, {
      from: web3.eth.accounts[5]
    }).then(() => {
       return crowdsale.balanceOf.call(crowdsale.address)
    })
    .then(function(bal) {
      assert.equal(bal.valueOf(), 50)

      // TODO: should we test whether withdrawToken can't be called by non owners
      return crowdsale.withdrawToken(crowdsale.address, { from: ownerAddr })
    })
    .then(function() {
      return crowdsale.balanceOf.call(crowdsale.address)
    })
    .then(function(bal) {
      assert.equal(bal.valueOf(), 0)
    })
  })


  // should allow for calling grantVested()
  var TEAM_TOKENS = 10*1000*1000 * 1000;

    // Grant tokens pre-allocated for the team
    // grantVestedTokens(
    //   _adexTeamAddress, ALLOC_TEAM,
    //   uint64(now), uint64(now) + 91 days , uint64(now) + 365 days, 
    //   false, false
    
  it('call grant6MVest() from team pool', () => {

    //crowdsale.balanceOf(adexTeamAddr2).then(function(bal) { console.log(bal.toNumber()) })
    
    return crowdsale.grant6MVest(adexTeamAddr2, TEAM_TOKENS , { from: adexTeamAddr1 })
   .then(function() { 
      return crowdsale.balanceOf(adexTeamAddr2)
   }).then(function(b) {
      assert.equal(b.toNumber(), TEAM_TOKENS)
   })
  })

    
  it('call grant6MVest() from owner, we should have remaining tokens', () => {    
    return crowdsale.grant6MVest(web3.eth.accounts[9], 10000*1000 , { from: ownerAddr })
   .then(function() { 
      return crowdsale.balanceOf(web3.eth.accounts[9])
   }).then(function(b) {
      assert.equal(b.toNumber(), 10000*1000)
   })
  })

  // vested tokens
  it('vesting schedule - check cliff & vesting afterwards (advances time)', () => {
    var recepient = web3.eth.accounts[6]


    var totalDays = 182;
    var quarterDays = totalDays / 4;
    var halfDays = totalDays / 2;
    var quarterAmount = Math.round(quarterDays/totalDays * TEAM_TOKENS); // quarter days worth of 10m tokens
    var halfAmount = Math.round(halfDays/totalDays * TEAM_TOKENS); // half days worth of 10m tokens

    return crowdsale.transfer(recepient, quarterAmount, { from: adexTeamAddr2 })
    .then(function() { throw new Error('should not be here - allowed to transfer - 1') })
    .catch(function(err) {
      assert.equal(err.message, 'VM Exception while processing transaction: invalid opcode')

      return time.move(web3, quarterDays*24*60*60)
    })
    .then(function() {
      return crowdsale.transfer(recepient, quarterAmount, { from: adexTeamAddr2 })
    }).then(function() {
      return crowdsale.balanceOf(recepient)
    }).then(function(b) {
      assert.equal(b.toNumber(), quarterAmount)

      return time.move(web3, (halfDays-quarterDays)*24*60*60)
    }).then(function() {
      // first make sure we can't get ahead of ourselves
      var amount = halfAmount-quarterAmount

      // try to get 10 more tokens initially
      return crowdsale.transfer(recepient, amount + 10*10000, { from: adexTeamAddr2 })
      .then(function() { 
        throw new Error('should not be here - allowed to transfer - 2') 
      })
      .catch(function(err) {        
        assert.equal(err.message, 'VM Exception while processing transaction: invalid opcode')
        return crowdsale.transfer(recepient, amount, { from: adexTeamAddr2 })
      })
    })
    .then(function() {
      return crowdsale.balanceOf(recepient)
    }).then(function(b) {
      assert.equal(b.toNumber(), halfAmount)
    });
  });


});
