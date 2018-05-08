var mongoose = require('mongoose');

var gamesSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, unique: true, index: true },
  home : String,
  away : String,
  win_odd : Number,
  draw_odd : Number,
  loss_odd : Number
});


var Games =  mongoose.model('Games', gamesSchema);


module.exports = {Games};