var _k = CF.Utils._k
var print = CF.Utils.logger.getLogger('CF.Accounts').print;
var ns = CF.Accounts;
ns.collection._ensureIndex({refId: 1});

ns._importFromUser = function (userId){
  var user = Meteor.users.findOne({_id: userId});
  if (!user) return;
  var accounts = user.accounts || {};
  var accountsPrivate = user.accountsPrivate || {};
  _.each (accounts, function(account, key){
    var doc = {
      name: account.name,
      addresses: account.addresses,
      refId: userId,
      createdAt: new Date(),
      index: key // back compat. no need
    }
    ns.collection.upsert({
      refId: userId,
      index: key // back compat. no need
    }, doc);
  });
  _.each (accountsPrivate, function(account, key){
    var doc = {
      name: account.name,
      addresses: account.addresses,
      isPrivate: true,
      refId: userId,
      createdAt: new Date(),
      index: key, // back compat. no need
    }
    ns.collection.upsert({
      refId: userId,
      index: key // back compat. no need
    }, doc);
  });
}

Meteor.methods({
  importAccounts: function(sel){
    var user = Meteor.user();
    if (!user || !user.hasSuperPowers) return;

    Meteor.users.find(sel||{_id: "ErwxCME6azQS7KcNm"}, {fields: {_id: 1}}).forEach(function(user){
      console.log(user._id);
      ns._importFromUser(user._id);
    });
  },

  // autoupdate balances for user
  cfAssetsUpdateBalances: function(options) {
    console.log(options);
    options = CF.Utils.normalizeOptionsPerUser(options);

    print("cfAssetsUpdateBalances was called with options", options, true)
    options.refId = options.userId || this.userId;
    options.private = options.userId == this.userId;
    if (!options.userId && !options.accountKey) return {
      error: "neither userId nor accountKey passed"
    }
    this.unblock(); //? not sure this is what needed
    return ns._updateBalances(options);
  },
})

// get auto balances per address
ns.quantumCheck = function(address) {
  try {
    print("checking address", address, true)
    var r = HTTP.call("GET", "http://quantum.cyber.fund:3001?address=" + address);
    if (r.statusCode == 200)
      return r.data;
  } catch (e) {
    print("on checking address " + address + " quantum returned code ",
      e && e.response && e.response.statusCode, true)
    return ['error'];
  }
}

//

// per single address.
// todo: operate at account level?
// private should be set by server.
ns._updateBalanceAddress = function(account, address) {
  var addressObj = account && account.addresses && account.addresses[address];
  if (!account || !addressObj) {
    print("no account or address object; account", account, true);
    print("address", address);return;
  }

  var modify = {$set: {},$unset: {}};

  var key = _k(['addresses', address, 'assets']);
  _.each(addressObj.assets, function(asset, assetKey) {
    if (asset.update === 'auto') {
      modify.$unset[_k([key, assetKey])] = "true"
    }
  });

  var balances = ns.quantumCheck(address);
  if (balances[0] == 'error') return;
  print("balances", balances)

  _.each(balances, function(balance) {
    var asset = balance.asset;
    if (!asset) return;

    var quantity;
    try {
      quantity = parseFloat(balance.quantity)
    } catch (e) {
      print ("catched non-string balance at", _k([account._id, address, balance.asset]) )
      quantity = balance.quantity;
      if (typeof quantity != 'number') return;
    }

    var k = _k([key, asset]);
    modify.$set[k] = {
      update: 'auto',
      quantity: quantity,
      asset: asset,
      updatedAt: new Date(),
    };
    delete modify.$unset[k];
  });
  if (_.isEmpty(modify.$unset)) delete(modify.$unset);
  if (_.isEmpty(modify.$set)) delete(modify.$set);
  if (_.keys(modify).length) {
    modify.$set[_k(['addresses', address, 'updatedAt'])] = new Date();
  }
  ns.collection.update({_id: account._id}, modify);
}


// is version of _updateBalanceAddress, aims to operate at account level (less writes to db)
// ==========   NOT TESTED !   ====================
ns._updateBalanceAccount = function(account) {

  if (!account) {
    print("no account", account, true);
    print("address", address);return;
  }
  if (!account.addresses) return;
  var modify = {$set: {},$unset: {}};

  _.each(account.addresses, function(addressObj, address){
    //var addressObj = account && account.addresses && account.addresses[address];
    var key = _k(['addresses', address, 'assets']);
    _.each(addressObj.assets, function(asset, assetKey) {
      if (asset.update === 'auto') {
        modify.$unset[_k([key, assetKey])] = "true"
      }
    });

    var balances = ns.quantumCheck(address);
    if (balances[0] == 'error') return;
    print("balances", balances)

    _.each(balances, function(balance) {
      var asset = balance.asset;
      if (!asset) return;

      var quantity;
      try {
        quantity = parseFloat(balance.quantity)
      } catch (e) {
        print ("catched non-string balance at", _k([account._id, address, balance.asset]) )
        quantity = balance.quantity;
        if (typeof quantity != 'number') return;
      }

      var k = _k([key, asset]);
      modify.$set[k] = {
        update: 'auto',
        quantity: quantity,
        asset: asset,
        updatedAt: new Date(),
      };
      delete modify.$unset[k];
    });

    if (_.keys(modify).length) {
      modify.$set[_k(['addresses', address, 'updatedAt'])] = new Date();
    }
  });

  if (_.isEmpty(modify.$unset)) delete(modify.$unset);
  if (_.isEmpty(modify.$set)) delete(modify.$set);
  if (_.keys(modify).length) {
    modify.$set[_k(['updatedAt'])] = new Date();
  }
  ns.collection.update({_id: account._id}, modify);
}

// autoupdate balances.
// 1. userId passed - do for all accounts
// 2. accountKey passed - do for that accountKey (use userId too.)
ns._updateBalances = function(options) { //todo: optimize
  check(options, Object);

  var refId = options.refId;
  var accountKey = options.accountKey;
  var address = options.address;
  var private = options.private;

  var selector = {};
  if (options.refId) _.extend (selector, {refId: refId})
  if (options.accountKey) _.extend (selector, {_id: accountKey});
  //if (!options.private) _.extend (selector, {isPrivate: {$ne: true}});

  if (address) {
    if (!options.refId) return;
    console.log(111)
    console.log(selector);
    var account = CF.Accounts.collection.findOne(selector);
    console.log(account);
    ns._updateBalanceAddress(account, address);
  } else {
    CF.Accounts.collection.find(selector).forEach(function(account){
      ns._updateBalanceAccount(account);
    });
  }


  if (!accountKey) { //TODO  put rate limiter back. now testing..
    if (!private) {/* rate limiter
      var lastUpdate = accounts.services && accounts.services.balanceUpdate
        && accounts.services.balanceUpdate.updatedAt;
      if (lastUpdate && (new Date().valueOf() - lastUpdate.valueOf()) < 300000) { //5 minutes
        print("quitting mass balance update", "last was <5 minutes ago");
        return;
      } else {
        Meteor.users.update({_id: userId}, {$set: {
            "services.balanceUpdate.updatedAt": new Date()
          }
        });
      }*/
    }
  }
}
