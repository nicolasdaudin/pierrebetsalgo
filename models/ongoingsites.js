var mongoose = require('mongoose');

var ongoingsitesSchema = new mongoose.Schema({
  iterNb:Number,
  name : String,
  solde: Number, // current solde
  deposit: Number, // total deposit
  deposit_pierre : Number, // deposit suggested by Pierre
  withdraw : Number , // total withdrawn
  commission_type : String, // 'RS', 'CPA'
  commission_amount: Number, // 40 (40 CPA) ou 25 (25%),
  commission_availability : Boolean, 
  bonus_status : String,  // 'not yet','ongoing','done',
  bonus_type : String, 
        // - 'welcome' (bonus de bienvenue donné dès le dépôt)
        // - 'refund' (1er pari remboursé si 1er pari perdant)
        // - 'free_win_or_lose' (pari gratuit après le 1er pari)
        // - 'free_lose' (pari gratuit après le 1er pari perdant)
        // - 'played' (bonus basé sur le montant joué)
  
  bonus_limit : Number, // 100 (100 euros), 190 (190 euros remboursés)
  bonus_remaining : Number, // Remaining bonus to be validated
  bonus_solde : Number, // Solde du Bonus (à jouer)
  bonus_percentage : Number, // 100 (100 % of the amount), 80 (80% of the amount)
  bonus_min_odd : Number, // 2.4 (cote minimum) - 0 si pas de cote minimum
  first_bet_min_odd : Number, // cote minimum pour le premier pari sinon pas de bonus - 0 si pas de cote minimum
  times : Number, // 4 (number of "times" to validate the bonus) - 0 si pas de "times" 
  site_status: String, // 'not yet','ongoing','done',
  order_pierre : Number
});

ongoingsitesSchema.index({iterNb:1,name:1}, {unique: true});

var OngoingSites =  mongoose.model('OngoingSites', ongoingsitesSchema);


var resetOngoingSites = function(){
  OngoingSites.remove({},function(err,result){
    console.log('OngoingSites - remove - err:%s - result:%s',err,result);
  });
}

var createNewSites = function(iterNb){
  OngoingSites.insertMany([
    {name:'JOA',solde:0,deposit:0,deposit_pierre:75,withdraw:0,site_status:'not yet',order_pierre:1,iterNb:iterNb,
      commission_type:'CPA',commission_amount:45,commission_availability:false,
      bonus_status:'not yet',bonus_type:'refund',bonus_limit:50,bonus_remaining:0,bonus_solde:0,bonus_percentage:100,first_bet_min_odd:0,bonus_min_odd:0,times:2}, // JOA on essaie de perdre le 1er pari?
    {name:'Unibet',solde:0,deposit:0,deposit_pierre:100,withdraw:0,site_status:'not yet',order_pierre:2,iterNb:iterNb,
      commission_type:'CPA',commission_amount:50,commission_availability:true,
      bonus_status:'not yet',bonus_type:'free_win_or_lose',bonus_limit:100,bonus_remaining:0,bonus_solde:0,bonus_percentage:100,first_bet_min_odd:1.40,bonus_min_odd:0,times:1}, // Unibet : Pierre essaie de gagner le 1er pari
    {name:'France Pari',solde:0,deposit:0,deposit_pierre:100,withdraw:0,site_status:'not yet',order_pierre:3,iterNb:iterNb,
      commission_type:'CPA',commission_amount:25,commission_availability:true,
      bonus_status:'not yet',bonus_type:'refund',bonus_limit:100,bonus_remaining:0,bonus_solde:0,bonus_percentage:100,first_bet_min_odd:0,bonus_min_odd:1.10,times:3}, // France-Pari : On essaie de perdre le 1er pari?
    {name:'Netbet',solde:0,deposit:0,deposit_pierre:190,withdraw:0,site_status:'not yet',order_pierre:4,iterNb:iterNb,
      commission_type:'CPA',commission_amount:30,commission_availability:true,
      bonus_status:'not yet',bonus_type:'refund',bonus_limit:190,bonus_remaining:0,bonus_solde:0,bonus_percentage:100,first_bet_min_odd:0,bonus_min_odd:2,times:6}, // Netbet: Pierre essaie de gagner le 1er pari - cote de 2
    {name:'PMU',solde:0,deposit:0,deposit_pierre:100,withdraw:0,site_status:'not yet',order_pierre:7,iterNb:iterNb,
      commission_type:'CPA',commission_amount:40,commission_availability:true,
      bonus_status:'not yet',bonus_type:'none',bonus_limit:100,bonus_remaining:0,bonus_solde:0,bonus_percentage:25,first_bet_min_odd:0,bonus_min_odd:0,times:0}, // PMU: on essaie de gagner le 1er pari?
    {name:'BWin',solde:0,deposit:0,deposit_pierre:100,withdraw:0,site_status:'not yet',order_pierre:8,iterNb:iterNb,
      commission_type:'RS',commission_amount:25,commission_availability:true,
      bonus_status:'not yet',bonus_type:'free_lose',bonus_limit:107,bonus_remaining:0,bonus_solde:0,bonus_percentage:100,first_bet_min_odd:0,bonus_min_odd:0,times:1}, // BWin : on essaie de perdre le 1er pari? 
    {name:'Parions Web',solde:0,deposit:0,deposit_pierre:100,withdraw:0,site_status:'not yet',order_pierre:6,iterNb:iterNb,
      commission_type:'CPA',commission_amount:40,commission_availability:true,
      bonus_status:'not yet',bonus_type:'refund',bonus_limit:100,bonus_remaining:0,bonus_solde:0,bonus_percentage:80,first_bet_min_odd:0,bonus_min_odd:0,times:0},
    {name:'Betclic',solde:0,deposit:0,deposit_pierre:100,withdraw:0,site_status:'not yet',order_pierre:9,iterNb:iterNb,
      commission_type:'CPA',commission_amount:30,commission_availability:false,
      bonus_status:'not yet',bonus_type:'refund',bonus_limit:100,bonus_remaining:0,bonus_solde:0,bonus_percentage:100,first_bet_min_odd:0,bonus_min_odd:0,times:0},
    {name:'Winamax',solde:0,deposit:0,deposit_pierre:100,withdraw:0,site_status:'not yet',order_pierre:5,iterNb:iterNb,
      commission_type:'CPA',commission_amount:40,commission_availability:false,
      bonus_status:'not yet',bonus_type:'refund',bonus_limit:100,bonus_remaining:0,bonus_solde:0,bonus_percentage:100,first_bet_min_odd:0,bonus_min_odd:0,times:0},
    {name:'Betstar',solde:0,deposit:0,deposit_pierre:100,withdraw:0,site_status:'not yet',order_pierre:10,iterNb:iterNb,
      commission_type:'CPA',commission_amount:38,commission_availability:false,
      bonus_status:'not yet',bonus_type:'refund',bonus_limit:50,bonus_remaining:0,bonus_solde:0,bonus_percentage:100,first_bet_min_odd:2,bonus_min_odd:0,times:0},
    {name:'Genybet',solde:0,deposit:0,deposit_pierre:0,withdraw:0,site_status:'not yet',order_pierre:11,iterNb:iterNb,
      commission_type:'CPA',commission_amount:30,commission_availability:true,
      bonus_status:'not yet',bonus_type:'refund',bonus_limit:50,bonus_remaining:0,bonus_solde:0,bonus_percentage:100,first_bet_min_odd:0,bonus_min_odd:0,times:0}
      
    ]
    ,{'ordered':false},function(err,result){
      console.log('OngoingSites - insertMany - err:%s - result:%s',err,result.length);
    }
  );

};





module.exports = {OngoingSites,resetOngoingSites,createNewSites};