var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var mongoose = require('mongoose');
var moment = require ('moment');
moment.locale('es');

var async = require ('async');




app.set('port', process.env.PORT || 3000);




app.use(express.static('static'));
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing 


app.get('/', function (req, res) {
  var homepageHtml = 
  		"<div>" + 
  		"<h1>Welcome to Pierrebetsalgo</h1>" + 
  		"<h2>MAIN MENU</h2>" +   		
  		"</div>";
  res.send(homepageHtml);
  console.log('Server time is : ', moment());
});


/** DATABASE and FINAL SERVER INIT **/ 
var database_url = process.env.DATABASE_URL;
console.log('Trying to connect to',database_url);
//mongoose.connect(database_url,{ config: { autoIndex: false } });
mongoose.connect(database_url);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
	// Node app started, only if and when successfully connected to DB 
	console.log('DB Connected');
	app.listen(app.get('port'), function () {
	  console.log('Example app listening on port ' + app.get('port'));
	});
});

module.exports = app;