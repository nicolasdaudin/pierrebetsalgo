var mongoose = require('mongoose');

var historySchema = new mongoose.Schema({
  iterNb:Number,
  games : [],
  elapsed: Number,
  logs: [], 
  init_bankroll : Number, 
  final_bankroll : Number , 
  final_betNumber : Number,
  frais: Number,
  gains_finaux : Number
});

historySchema.index({iterNb:1}, {unique: true});

var History =  mongoose.model('History', historySchema);


module.exports = {History};