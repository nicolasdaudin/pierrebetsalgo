var mongoose = require('mongoose');

var bettingsitesSchema = new mongoose.Schema({
  name : String,
  bonus_type : String, 
        // - 'welcome' (bonus de bienvenue donné dès le dépôt)
        // - 'refund' (1er pari remboursé si 1er pari perdant)
        // - 'free' (pari gratuit si 1er pari perdant)
        // - 'played' (bonus basé sur le montant joué)
  bonus_limit : Number, // 100 (100 euros), 190 (190 euros remboursés)
  bonus_percentage : Number, // 100 (100 % of the amount), 80 (80% of the amount)
  min_odd : Number, // 2.4 (cote minimum) - 0 si pas de cote minimum
  times : Number, // 4 (number of "times" to validate the bonus) - 0 si pas de "times"
  commission_type : String, // 'RS', 'CPA'
  commission_amount: Number, // 40 (40 CPA) ou 25 (25%),
  commission_availability : Boolean, 
  order_pierre: Number // 1, 2, 3... preference, 1 being the most important, selon Pierre
});

bettingsitesSchema.index({name:1}, {unique: true});

// ordre theorique :  joa, unibet, francepari, netbet, pmu, bwin, paronsweb,betclic,winamax,betstar
// ordre constaté (4T2017) : Joa, Unibet, France-Pari, Netbet, Parions Web, PMU, BWin, Betclic, Winamax, Betstar
/*JOA: Pari remboursé jusque 50 € à parier 2 fois - 25% premier dépôt, parier 2 fois, jusque 100 €  - 45 € CPA (pas dispo)
Unibet: Pari gratuit jusque 100 € - Gain net - Cote Min 1.40 sur le premier pari - 50 € CPA
France Pari: Pari remboursé jusque 100 € - parier 3 fois - Min 1.10 - 25€ CPA
Netbet: Pari remboursé jusque 190 € - parier 6 fois - Cote Min 2 - 30 € CPA
PMU: Bonus de 25% des paris effectués, jusque 100 €, en 4 fois - 40 € CPA
BWIN: Pari gratuit 107 € - Gain net - 25% RS
Parions Web: Pari remboursé 80% jusque 100 € - aucune condition - 40€ CPA
Betclic: Pari remboursé 100 € - aucune condition - 30 € CPA (pas dispo)
Winamax: Pari remboursé 100 € - aucune condition - 50 € CPA (pas dispo, Pierre?)
Betstar : Pari remboursé 50 € - Cote mini 2 sur le premier pari - 38 € CPA (pas dispo)
Genybet : Pari remboursé 50 € - aucune condition - 30 € CPA (pas encore dans le programme)*/

var BettingSites =  mongoose.model('BettingSites', bettingsitesSchema);


var reset = function(){
  BettingSites.remove({},function(err,result){
    console.log('BettingSites - remove - err:%s - result:%s',err,result);
  });

  BettingSites.insertMany([
    {name:'JOA',bonus_type:'refund',bonus_limit:50,bonus_percentage:100,min_odd:0,times:2,commission_type:'CPA',commission_amount:45,commission_availability:false,order_pierre:1},
    {name:'Unibet',bonus_type:'free',bonus_limit:100,bonus_percentage:100,min_odd:0,times:0,commission_type:'CPA',commission_amount:50,commission_availability:true,order_pierre:2},
    {name:'France Pari',bonus_type:'refund',bonus_limit:100,bonus_percentage:100,min_odd:1.10,times:3,commission_type:'CPA',commission_amount:25,commission_availability:true,order_pierre:3},
    {name:'Netbet',bonus_type:'refund',bonus_limit:190,bonus_percentage:100,min_odd:2,times:6,commission_type:'CPA',commission_amount:30,commission_availability:true,order_pierre:4},
    {name:'PMU',bonus_type:'played',bonus_limit:25,bonus_percentage:25,min_odd:0,times:0,commission_type:'CPA',commission_amount:40,commission_availability:true,order_pierre:6},
    {name:'BWin',bonus_type:'free',bonus_limit:107,bonus_percentage:100,min_odd:0,times:0,commission_type:'RS',commission_amount:25,commission_availability:true,order_pierre:7},
    {name:'Parions Web',bonus_type:'refund',bonus_limit:100,bonus_percentage:80,min_odd:0,times:0,commission_type:'CPA',commission_amount:40,commission_availability:true,order_pierre:5},
    {name:'Betclic',bonus_type:'refund',bonus_limit:100,bonus_percentage:100,min_odd:0,times:0,commission_type:'CPA',commission_amount:30,commission_availability:false,order_pierre:8},
    {name:'Winamax',bonus_type:'refund',bonus_limit:100,bonus_percentage:100,min_odd:0,times:0,commission_type:'CPA',commission_amount:40,commission_availability:false,order_pierre:9},
    {name:'Betstar',bonus_type:'refund',bonus_limit:50,bonus_percentage:100,min_odd:2,times:0,commission_type:'CPA',commission_amount:38,commission_availability:false,order_pierre:10}
    /*{name:'Genybet',bonus_type:'refund',bonus_limit:50,bonus_percentage:100,min_odd:0,times:0,commission_type:'CPA',commission_amount:30,commission_availability:false,order_pierre:11},*/
    ]
    ,{'ordered':false},function(err,result){
      console.log('BettingSites - insertMany - err:%s - result:%s',err,result.length);
    }
  );

};

module.exports = {BettingSites,reset};