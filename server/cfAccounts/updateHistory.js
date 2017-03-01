const selectorService = require("/imports/api/userFunds").selectorService;
const updateUserFunds = require("/imports/api/userFunds/userHistory").updateUserFunds;
const handleArrayWithInterval = require("/imports/api/handleArray").handleArrayWithInterval
const selectorSatoshiPie = require("/imports/api/userFunds").selectorSatoshiPie;
const print = CF.Utils.logger.getLogger('FUNDS').print

function dealWithPopulars(){
  print("starting hourly funds recalculation (for lucky funds)", true)
  handleArrayWithInterval( _.pluck( Meteor.users.find(selectorService, {fields: {_id: 1}}).fetch(), '_id'), 20000, updateUserFunds)
}

function dealWithAll(){
  print("starting daily/3 funds recalculation (for all funds)", true)
  handleArrayWithInterval( _.pluck( Meteor.users.find({}, {fields: {_id: 1}}).fetch(), '_id'), 50000, updateUserFunds)
}

SyncedCron.add({
  name: 'hourly user history',
  schedule: function (parser) {
    return parser.cron('49 * * * *', false);
  },
  job: function () {
    dealWithPopulars();
  }
})
//
// SyncedCron.add({
//   name: 'frequent update of satoshi account',
//   schedule: function (parser) {
//     return parser.cron('0/5 * * * *', false);
//   },
//   job: function(){
//     print("starting 0/5 satoshi-fund recalculation", true);
//     var user = Meteor.users.findOne(selectorSatoshiPie);
//     var accounts = CF.Acounts.collection.find({refId: user._id}).fetch()
//     handleArrayWithInterval(accounts, 15000, function(it){
//       CF.Acounts._updateBalanceAccount(it, {private: true})
//     });
//   }
// })

SyncedCron.add({
  name: 'daily user history',
  schedule: function (parser) {
    return parser.cron("17 1/6 * * *", false);
  },
  job: function () {
    dealWithAll();
  }
});

// dev test only
Meteor.startup(function(){
//  dealWithPopulars();
})
