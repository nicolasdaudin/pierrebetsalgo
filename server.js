var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var mongoose = require('mongoose');
var moment = require ('moment');
moment.locale('fr');

var async = require ('async');

var Games = require('./models/games');

var BettingSites = require('./models/bettingsites');
var OngoingSites = require('./models/ongoingsites').OngoingSites;
var createNewSites = require('./models/ongoingsites').createNewSites;
var resetOngoingSites = require('./models/ongoingsites').resetOngoingSites;






app.set('port', process.env.PORT || 3000);




app.use(express.static('static'));
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing 

app.set('views', './views');
app.set('view engine', 'pug');

app.get('/', function (req, res) {  
  res.render('index');
});

const BANKROLL_INIT = 175;
const FRAIS = 97;
const INIT_DAYS_LOOP = moment('2017-01-13');
const END_DAYS_LOOP = moment('2017-05-21');
const INTERVAL_OF_DAYS = 3;
// difference entre le plus petit bet et le plus gros bet
const BET_DIFFERENCE_FACTOR = 2.5; 
// somme en bankroll minimum pour ouvrir un nouveau site. (devrait être le bonus_limit minimum disponible...)
const MIN_BONUS_NECESSARY = 50;

app.get('/simulateonemember',function(req,res){
	var nbIterations = 1;
	resetOngoingSites();
	simulateManyMembers(nbIterations,function(err,result){
		//console.log('$%$&$& FINAL RESULT simulateonemember',result);
		res.render('simulateonemember',{
    		nb:nbIterations,
    		games:result.games,
    		elapsed:result.elapsed,
    		logs:result.logs,
    		init_bankroll : result.init_bankroll,
    		final_bankroll : result.final_bankroll,
    		final_betNumber : result.final_betNumber,
    		frais : result.frais,
    		gains_finaux : result.gains_finaux
    	});
	})

});

app.get('/simulatemanymembers/:nb',function(req,res){

	var nbIterations = req.params.nb;

	var resultIter = [];
	var simulationBegin = moment();

	resetOngoingSites();

	// d'abord on va faire un async.waterfall ou async.each, les simulations doivent se suivre (sinon les database vont s'écraser et ça n'aura aucun sens)
	// ensuite il faudra faire un async.parallel, mais il faudra inclure dans le ongoingsites le numéro de l'iteration
	//var iterNb = 1;
	var iterations = [];
	for (var i = 1; i<=nbIterations;i++){
		iterations.push(i);
	}

	var iterNb = 1;

	//console.log(coll);
	async.each(
		iterations,
		function(iterNb,callback){
			simulateManyMembers(iterNb,function(err,iterObj){
				//console.log('&%&·%%$·%$%· CALLBACK SIMULATE MANY MEMBERS with resultiter',callback);
				resultIter.push(iterObj);
				//iterNb++;
				callback();		
			});
		},
		function(err,result){
			console.log('$%$&$& FINAL RESULT simulatmanymembers',result);
			var simulationEnd = moment();    		
			var simulationElapsed = simulationEnd.diff(simulationBegin,'SSS');
			console.log('##### END OF ITERATIONS - %s iterations done in %s milliseconds',nbIterations,simulationElapsed);


			//var max_gains_finaux = resultIter.reduce( (max,iter) => Math.max(max,iter.gains_finaux));
			var max_gains_finaux = resultIter.reduce( (max,iter) => Math.max(max,iter.gains_finaux),0);
			var total_gains_finaux = resultIter.reduce( (total,iter) => total + parseFloat(iter.gains_finaux),0);
			var avg_gains_finaux = total_gains_finaux/resultIter.length;
			var min_gains_finaux = resultIter.reduce( (min,iter) => Math.min(min,iter.gains_finaux),1000);

			resultIter.sort(function compare(a, b) {
			  if (Number(a.gains_finaux) < Number(b.gains_finaux))
			     return -1;
			  if (Number(a.gains_finaux) > Number(b.gains_finaux)) //(a est supérieur à b selon les critères de tri)
			     return 1;
			  // a doit être égal à b
			  return 0;
			});


			console.log('MAX GAINS FINAUX',max_gains_finaux);
			console.log('TOTAL GAINS FINAUX',total_gains_finaux);
			console.log('AVERAGE GAINS FINAUX',avg_gains_finaux);
			console.log('MINIMUM GAINS FINAUX',min_gains_finaux);


			res.render('simulatemanymembers',{
				result:resultIter,
				elapsed:simulationElapsed,
				nb:nbIterations,
				max:max_gains_finaux,
				average:avg_gains_finaux,
				min:min_gains_finaux
			});
		}
	);


	
});

async function simulateManyMembers (iterNb,callbackWhilstManyIterations){
	
	var bankroll = BANKROLL_INIT;
	var betNumber = 1;
	var noMoreAvailableSites = false;

	// décider du match
	const loopFrom = INIT_DAYS_LOOP ; 
	const loopUntil = END_DAYS_LOOP;
	const intervalOfDays = INTERVAL_OF_DAYS;
	
	var tempBegin = moment(loopFrom);
	var tempEnd = moment(tempBegin).add(intervalOfDays,'days');
	
	var processBegin = moment();
    

	var chosenGames = [];

	var logs = [];

	createNewSites(iterNb);

	async.doWhilst(
		async function dofunction(){
			//console.log('dates',tempBegin,tempEnd);

			try {
				
				var games = await Games.findBetweenDates(tempBegin,tempEnd);
				
				console.log('[Bet #%s] Nb of games found between %s and %s :',betNumber,tempBegin.format('DD MMM'),tempEnd.format('DD MMM'),games.length);
				if (games && games.length <= 4){
					tempEnd = moment(tempEnd).add(1,'days');
					return;
				}

				// ######## DECIDER DES SITES SUR LESQUELS ON PARIE - SI BESOIN, EN OUVRIR UN NOUVEAU
				// VOIR LES SITES AVAILABLE
				var ongoingsites = await OngoingSites.find({iterNb:iterNb,site_status:'ongoing'}).exec();
				
				
				if ( !ongoingsites || ongoingsites.length === 0 || ongoingsites.length === 1){
					// aucun site, il faut rajouter des sites
					// ou bien un seul site, on est plus au début, on rajoute quand même deux sites

					// pour l'instant, on prend les deux premies sites 'not yet' de la liste de Pierre
					var notyetsites = await OngoingSites.find({iterNb:iterNb,site_status:'not yet'},{},{sort:{order_pierre:1},limit:2}).exec();

					if (!notyetsites || notyetsites.length === 0){
						// no more 'not yet' sites either, it means we are done with all the sites
						console.log('[Bet #%s] NO MORE SITES, WE STOP',betNumber);
						logs.push({type:'site',msg:'Plus de site disponible, simulation terminée'});
						noMoreAvailableSites = true;
						return ;

					} else if (notyetsites && notyetsites.length === 1){
						// only one site left
						console.log('[Bet #%s] ONLY ONE SITE LEFT, WE STOP',betNumber);											
						logs.push({type:'site',msg:'Plus qu\'un seul site dispo, simulation terminée'});
						noMoreAvailableSites = true;
						return ;
					} else {

						console.log('[Bet #%s] EN TRAIN DE CHOISIR PARMI CES DEUX SITES: %s et %s',betNumber,notyetsites[0].name,notyetsites[1].name);		

						console.log('chooseBetweenTwoSites');

						// on regarde si les bonus des deux sites choisis sont inférieurs à la bankroll
						var firstSite = notyetsites[0];
						var secondSite = notyetsites[1];
						var chosenSiteNb = 0;
						var otherSiteNb = -1;

						if (ongoingsites.length > 0 && (firstSite.bonus_limit + secondSite.bonus_limit > bankroll)){
							// dans le cas où il y a encore au moins un site ongoing, on ne démarre pas forcément deux sites
							// si la somme des bonus qu'on peut récupérer est supérieure à la bankroll actuelle
							// pour maximiser les gains, on ne va donc démarrer qu'un seul site au lieu de deux
							// on prendra le site avec le plus gros bonus (inférieur à la bankroll)
							if (firstSite.bonus_limit > secondSite.bonus_limit){
								if (firstSite.bonus_limit <= bankroll) {
									chosenSiteNb = 0;
								} else if (secondSite.bonus_limit <= bankroll){
									chosenSiteNb = 1;
								} else {
									// les deux bonus sont plus gros que la bankroll, on choisit donc le site au hasard
									chosenSiteNb = Math.floor(Math.random() * 2);
								}
							} else if (firstSite.bonus_limit === secondSite.bonus_limit) {
								// même bonus
								// on choisit le site avec les conditions de bonus les plus intéressantes
								if (firstSite.times < secondSite.times){
									chosenSiteNb = 0;
								} else if (firstSite.times > secondSite.times){
									chosenSiteNb = 1;
								} else {
									// même nombre de paris pour valider
									// on regarde le bonus_min_odd
									if (firstSite.bonus_min_odd < secondSite.bonus_min_odd){
										chosenSiteNb = 0;
									} else if (firstSite.bonus_min_odd > secondSite.bonus_min_odd){
										chosenSiteNb = 1;
									} else {
										// même nombre de paris pour valider, et même bonus_min_odd
										// on choisit donc le site au hasard
										chosenSiteNb = Math.floor(Math.random() * 2);
									}
								}
							} else {
								// bonus du second site plus grand que bonus du premier site
								if (secondSite.bonus_limit <= bankroll){
									chosenSiteNb = 1;
								} else if (firstSite.bonus_limit <= bankroll){
									chosenSiteNb = 0;
								} else {
									// les deux bonus sont plus gros que la bankroll, on choisit donc le site au hasard
									chosenSiteNb = Math.floor(Math.random() * 2);
								}
							}

							//console.log('[Bet #%s] ###### AJOUT d\'1 SITE : %s (pas assez de bankroll pour commencer les 2 sites)',betNumber,notyetsites[chosenSiteNb].name);

							// ON essaie quand même de rajouter un deuxième site, en cherchant un site avec une bonus_limit inférieur à ce qui reste de bankroll
							// (on prend le premier site)
							// TODO: choisir le meilleur site
							var remainingBankroll = bankroll - notyetsites[chosenSiteNb].bonus_limit;
							var siteNames = [];												
							siteNames.push(notyetsites[chosenSiteNb].name);		
							if (ongoingsites.length > 0){
								ongoingsites.forEach(function (site){														
									siteNames.push(site.name);
								});
							}

							var bonussites = await OngoingSites.find({iterNb:iterNb,site_status:'not yet',bonus_limit:{$lte:remainingBankroll},name:{$nin:siteNames}},{},{sort:{bonus_limit:1},limit:1}).exec();

							if (bonussites && bonussites.length > 0){
								notyetsites.push(bonussites[0]);
								otherSiteNb = 2;
								console.log('[Bet #%s] ###### AJOUT de 2 SITES : %s et %s (on est allés chercher un deuxième site avec un bonus compatible)',betNumber,notyetsites[chosenSiteNb].name,bonussites[0].name);
							} else {
								console.log('[Bet #%s] ###### AJOUT d\'1 SITE : %s (pas assez de bankroll pour commencer les 2 sites)',betNumber,notyetsites[chosenSiteNb].name);																
							}
							//callbackChooseBetweenTwoSites(null,{chosenSiteNb,otherSiteNb});
								
							
						} else {
							// cas de zéro site ongoing: on doit absolument démarrer deux sites
							// cas de au moins un site ongoing : la somme des bonus des deux sites est égale ou inférieure à la bankroll
							// on peut donc effectivement commencer les deux sites.
							//console.log('Nb sites found',sites.length);
							console.log('[Bet #%s] ###### AJOUT DE 2 NOUVEAUX SITES',betNumber);
							

							// On assigne au hasard une partie de la bankroll selon le bonus_limit
							// (On verra ensuite pour leur assigner un dépôt FIXE depuis la BD)
							chosenSiteNb = Math.floor(Math.random() * 2);
							otherSiteNb = (chosenSiteNb === 1) ? 0 : 1;

							//callbackChooseBetweenTwoSites(null,{chosenSiteNb,otherSiteNb});

						}
						console.log('afterChoosingBetweenTwoSites');

						//var chosenSiteNb = result.chosenSiteNb;
						//var otherSiteNb = result.otherSiteNb;

						// On a deux sites, ou trois
						// Si on a deux sites, on regarde que ces deux sites ne sont pas tous les deux 'refund' sans avoir commencé le bonus
						// car si c'est le cas, on ne peut pas séparer le premier pari car s'il est perdant, on veut récupérer un max
						// tout cela à partir du second pari
						var premierPariPerdantBonusTypes = ['free_lose','refund','refund_partial_withdrawal','free_win_or_lose'];
						var siteNames = [];
						var nbOfSites = 0;
						var siteBonusLimits = 0;
						siteNames.push(notyetsites[chosenSiteNb].name);
						nbOfSites++;
						siteBonusLimits += notyetsites[chosenSiteNb].bonus_limit;

						if (ongoingsites.length > 0){
							ongoingsites.forEach(function (site){
								nbOfSites ++;
								siteNames.push(site.name);
								siteBonusLimits += site.bonus_limit;
							});
						}
						
						if (otherSiteNb > -1){
							siteNames.push(notyetsites[otherSiteNb].name);
							nbOfSites++;
							siteBonusLimits += notyetsites[otherSiteNb].bonus_limit;
						}
						console.log('[Bet #%s] %s site(s): %s',betNumber,nbOfSites,siteNames);

						//var nbOfSites = ongoingsites.length + 1 + (otherSiteNb > -1 ? 1 : 0);
						
						console.log('checkConditionsForThirdSite');
						var thirdSiteNeeded = false;
						console.log('thirdSiteNeeded - bankroll:',bankroll);
						if ((bankroll - siteBonusLimits ) > MIN_BONUS_NECESSARY){
							if (betNumber > 1 && nbOfSites === 2) {	
								thirdSiteNeeded = true;
								ongoingsites.forEach(function (site){
									if (!premierPariPerdantBonusTypes.includes(site.bonus_type)
										|| (premierPariPerdantBonusTypes.includes(site.bonus_type) && site.bonus_status !== 'not yet')){
										// ce site n'est pas 'refund'
										// ce site est refund mais le bonus a déjà commencé (donc le pari remboursé ne s'applique pas)
										thirdSiteNeeded = false;
									}
								});
								var secondSiteTemp = notyetsites[chosenSiteNb];
								if (!premierPariPerdantBonusTypes.includes(secondSiteTemp.bonus_type)
									|| (premierPariPerdantBonusTypes.includes(secondSiteTemp.bonus_type) && secondSiteTemp.bonus_status !== 'not yet')){
									// ce site n'est pas 'refund'
									// ce site est refund mais le bonus a déjà commencé (donc le pari remboursé ne s'applique pas)
									thirdSiteNeeded = false;
								}
								if (otherSiteNb > -1){
									var thirdSiteTemp = notyetsites[otherSiteNb];
									if (!premierPariPerdantBonusTypes.includes(thirdSiteTemp.bonus_type)
										|| (premierPariPerdantBonusTypes.includes(thirdSiteTemp.bonus_type) && thirdSiteTemp.bonus_status !== 'not yet')){
										// ce site n'est pas 'refund'
										// ce site est refund mais le bonus a déjà commencé (donc le pari remboursé ne s'applique pas)
										thirdSiteNeeded = false;
									}
								}
							}
						} else {
							console.log('[Bet #%s] ######## PAS DE NOUVEAUX DEPOTS - Tous les sites ongoing ou just_started sont de type Pari Remboursé/Gratuit et le premier pari n\'a pas été fait. Mais pas assez de bankroll pour ajouter un 3ème site',betNumber);
							logs.push({type:'msg',msg:`Pas de nouveau dépôt. On a besoin d'un troisième site (les deux autres sites ${siteNames} ont des premiers paris remboursés) mais pas assez de bankroll`});
									
						}

						console.log('findThirdSite');
						// tous les sites sont 'refund' et le premier pari n'a pas encore été effectué
						// on doit donc rajouter un troisième site, on a pas le choix...													

						// pour l'instant, on prend le premier site 'not yet' de la liste de Pierre
						var thirdsite = undefined;
						if (thirdSiteNeeded) {
							var thirdsites = await OngoingSites.find({iterNb:iterNb,name:{$nin:siteNames},site_status:'not yet'},{},{sort:{order_pierre:1},limit:1});
							if (!thirdsites || thirdsites.length === 0){
								// no more 'not yet' sites either, it means we are done with all the sites
								console.log('[Bet #%s] NO MORE SITES, WE STOP',betNumber);
								logs.push({type:'site',msg:'Plus de site disponible, simulation terminée'});
								noMoreAvailableSites = true;
								return;

							} else {

								console.log('[Bet #%s] ######## AJOUT d\'UN SITE - Tous les sites ongoing ou just_started sont type Pari Remboursé/Gratuit et le premier pari n\'a pas été fait. On rajoute un troisième site',betNumber);
								logs.push({type:'msg',msg:`On a besoin d'un troisième site (les deux autres sites ${siteNames} ont des premiers paris remboursés)`});
								thirdsite = thirdsites[0];
							}														
						} 

						
						console.log('afterAllOfThem');
						var sitesNb = [chosenSiteNb,otherSiteNb];
						if (thirdsite){
							console.log('[Bet #%s] afterAllOfThem - Troisième site à rajouter: %s',betNumber,thirdsite.name);
							notyetsites.push(thirdsite);
							sitesNb.push(2);
						} else {
							console.log('[Bet #%s] afterAllOfThem - Pas de troisième site à rajouter',betNumber);
						}


						// ON S'OCCUPE DES DEPOTS POUR CHAQUE SITE
						//console.log('sitesNb',sitesNb);
						//console.log('notyetsites',notyetsites);
						sitesNb.forEach(async function (siteNb){
							console.log('[Bet #%s] after afterAllOfThem - updateSite',betNumber);
							if (siteNb > -1){

								var site = notyetsites[siteNb];
								var deposit = Math.round(Math.min(bankroll,site.bonus_limit));
								var newSolde = precisionRound(deposit + site.solde,2);
								bankroll = precisionRound(bankroll - deposit,2);
								console.log('[Bet #%s] Site %s - Dépôt %s - Remaining Bankroll %s',betNumber,site.name,newSolde,bankroll);
								logs.push({type:'depot',msg:`${site.name} - Dépôt ${deposit} - Remaining Bankroll ${bankroll.toFixed(2)}`});

								var result = await OngoingSites.update({iterNb:iterNb,name:site.name},{deposit:deposit,solde:newSolde,site_status:'just_started'}).exec();
								//console.log('Updating site %s - err:%s - result %s',site.name,err,result);
								console.log('[Bet #%s] callback updateSite for site %s',betNumber,site.name);
							}
						});
						console.log('[Bet #%s] after all updateSite - callback decideSites',betNumber);
					}
				} else if ( ongoingsites.length === 2 ){
					// Y a déjà deux sites mais si la bankroll est suffisamment grande pour commencer le site suivant, on le commence
					// TODO ou si les deux sites sont refund + pas encore commencé

					// pour l'instant, on prend le premier site 'not yet' de la liste de Pierre qui a un bonus_limit inférieur à la bankroll
					var notyetsites = await OngoingSites.find({iterNb:iterNb,site_status:'not yet',bonus_limit:{$lte:bankroll}},{},{sort:{order_pierre:1},limit:1});
					//OngoingSites.find({iterNb:iterNb,site_status:'not yet'},{},{sort:{order_pierre:1},limit:1},function(err,notyetsites){

					if (!notyetsites || notyetsites.length === 0){
						/*// no more 'not yet' sites either, it means we are done with all the sites
						console.log('[Bet #%s] NO MORE SITES, WE STOP',betNumber);
						logs.push({type:'site',msg:'Plus de site disponible, simulation terminée'});
						noMoreAvailableSites = true;
						callbackDoWhilst();
						*/
						console.log('[Bet #%s] Pas de troisième site',betNumber);

					} else {

						// on regarde si le bonus du site choisi est inférieur à la bankroll
						// si c'est le cas on peut démarrer le site
						var site = notyetsites[0];											
						if (site.bonus_limit > bankroll){												
							console.log('[Bet #%s] ###### Déjà 2 sites. On ne commence pas de nouveau site, pas assez de bankroll (%s) pour le bonus du site suivant (%s,%s) dans la liste',betNumber,bankroll,site.name,site.bonus_limit);
							logs.push({type:'site',msg:`Déjà 2 sites et pas assez de bankroll (${bankroll.toFixed(2)}) pour commencer le site suivant ${site.name} (bonus: ${site.bonus_limit})`});

						} else {												
							console.log('[Bet #%s] ###### Assez de bankroll pour commencer un nouveau site',betNumber);
							
							var deposit = Math.round(Math.min(bankroll,site.bonus_limit));
							var newSolde = precisionRound(deposit + site.solde,2);
							bankroll = precisionRound(bankroll - deposit,2);
							console.log('[Bet #%s] Site %s - Dépôt %s - Remaining Bankroll %s',betNumber,site.name,newSolde,bankroll);
							logs.push({type:'depot',msg:`${site.name} - Dépôt ${deposit} - Remaining Bankroll ${bankroll.toFixed(2)}`});

							var result = await OngoingSites.update({iterNb:iterNb,name:site.name},{deposit:deposit,solde:newSolde,site_status:'just_started'});
							//console.log('Updating site %s - err:%s - result %s',site.name,err,result);
							console.log('[Bet #%s] callback decideSites pour site %s',betNumber,site.name);
						}

					}
					

				} else {
					// NOTHING TO DO
					// ON PASSE A LA SUITE, ET ON PARIE
					console.log('[Bet #%s] ###### déjà 3 sites, on ouvre rien de plus pour linstant',betNumber);
					console.log('callback decideSites');
				}

				console.log('begin decideGameAndBets');
					
				var startedSites = await OngoingSites.find({iterNb:iterNb,site_status:{$in:['ongoing','just_started','done']}},{},{sort:{order_pierre:1}}).exec();
				logs.push({type:'sites',info: { sites:startedSites, bankroll: bankroll}});

				// on recupere à nouveau les sites qui nous intéressent
				var sites = await OngoingSites.find({iterNb:iterNb,site_status:{$in:['ongoing','just_started']}}).exec();

				console.log("[Bet #%s] ###### CHOOSING BETS AND SITES (among %s sites)",betNumber,sites.length);									
				
				// ########################################################
				// FIND BEST SITE WITH BONUS TYPE AND BEST GAME
				// ########################################################
				var result = findBestSiteWithBonusTypeAndBestGame(sites,games,betNumber);
				var chosenSite = result.chosenSite;

				var otherSites = result.otherSites;
				var chosenGameObj = result.chosenGameObj;
				var logBonusType = result.logBonusType;

				

				//console.log('chosenGameObj',chosenGameObj);
				//console.log('otherSites',otherSites);
				//console.log('chosenSite',chosenSite);
				//console.log('otherSite',otherSite);
				
				var indexChosenGame = chosenGameObj.index;
				var chosenOddType = chosenGameObj.odd_type;
				var chosenGame = games[indexChosenGame];
				var gameLogObject = [];

				decideBets(chosenSite,otherSites,games,chosenGame,chosenOddType,logs,
					logBonusType, gameLogObject,betNumber)

				var allSites = [];
				allSites.push(chosenSite);
				otherSites.forEach(function(otherSite){
					allSites.push(otherSite);
				});
				
				// updating the sites in DB
				console.log('[Bet #%s] before updatePromisesBeforeResultGame',betNumber);
				const updatePromisesBeforeResultGame = allSites.map((site) => updateSite(site,iterNb,betNumber));
				await Promise.all(updatePromisesBeforeResultGame);

				
				console.log('[Bet #%s] after updatePromisesBeforeResultGame',betNumber);
				
				console.log('[Bet #%s] begin resultGame',betNumber);

				bankroll = computeResultGame(chosenGames,chosenGame,allSites,bankroll,betNumber,logs,gameLogObject);

				// updating the sites in DB
				const updatePromisesAfterResultGame = allSites.map((site) => updateSite(site,iterNb,betNumber));
				await Promise.all(updatePromisesAfterResultGame);

				console.log('[Bet #%s] Les deux sites ont été mis à jour en base',betNumber);

				console.log('####### NEXT GAME and ITERATION');

				tempBegin = moment(chosenGame.date).add(2,'days');
				tempEnd = moment(tempBegin).add(2+intervalOfDays,'days');
				betNumber++;

				return;
					
				
			} catch (err){
				console.log('CAUGHT ERROR WHILE EXECUTING',err);
			}
			
		},
		function whilefunction(){
			return (tempEnd.isSameOrBefore(loopUntil) && !noMoreAvailableSites);
			//return betNumber <=5;
		},
		function afterfunction(){

			OngoingSites.find({iterNb:iterNb},{},{sort:{order_pierre:1}},function(err,sites){
				logs.push({type:'msg_important',msg:'Bilan final'});
				logs.push({type:'sites',info: { sites:sites, bankroll: bankroll}});
			

				var processEnd = moment();    		
		    	var elapsed = processEnd.diff(processBegin,'SSS');
		    	var gains_finaux = (bankroll - BANKROLL_INIT - FRAIS).toFixed(2)
		    	/*res.render('simulateamember',{
		    		games:chosenGames,
		    		elapsed:elapsed,
		    		logs:logs,
		    		init_bankroll : BANKROLL_INIT,
		    		final_bankroll : bankroll.toFixed(2),
		    		final_betNumber : betNumber - 1,
		    		frais : FRAIS,
		    		gains_finaux : gains_finaux
		    	});*/
		    	console.log('[#%s] List of Games displayed. Time elapsed: %s milliseconds',iterNb,elapsed);

		    	var iterObj = {
		    		iterNb:iterNb,
		    		games:chosenGames,
		    		elapsed:elapsed,
		    		logs:logs,
		    		init_bankroll : BANKROLL_INIT,
		    		final_bankroll : bankroll.toFixed(2),
		    		final_betNumber : betNumber - 1,
		    		frais : FRAIS,
		    		gains_finaux : gains_finaux
		    	}


		    	//resultIter.push(iterObj);
		    	//iterNb++;
		    	callbackWhilstManyIterations(null,iterObj);
		    });
		}
	);


}

async function updateSite(site,iterNb,betNumber){
	var result = await OngoingSites.update({iterNb:iterNb,name:site.name},
		{
			solde:precisionRound(site.solde,2),
			bonus_remaining:precisionRound(site.bonus_remaining,2),
			bonus_status:site.bonus_status,
			withdraw:precisionRound(site.withdraw,2),
			site_status:site.site_status,
			bonus_solde:precisionRound(site.bonus_solde,2)
		}).exec();
	
	console.log('[Bet #%s] OngoingSites - updating sites - result:%s',betNumber,JSON.stringify(result));		
}

var computeResultGame = function(chosenGames,chosenGame,allSites,bankroll,betNumber,logs,gameLogObject){
	console.log("###### RESULT OF GAME");

	var final_result = decideRandomFinalResult(chosenGame);
	var winningOdds = findWinningOdds(final_result);
	chosenGame.final_result = final_result; //overwriting for display purpose
	chosenGames.push(chosenGame);


	// LOGGING 
	var indexlog = 0;
	if (gameLogObject[3]){
		// pari double chance
		if (winningOdds.includes('home_draw_odd') && gameLogObject[0]){
			indexlog = 0;									
		} else if (winningOdds.includes('away_draw_odd') && gameLogObject[1]){
			indexlog = 1;
		} else if (winningOdds.includes('home_away_odd') && gameLogObject[2]){
			indexlog = 2;
		}
	} else {
		// pari normal
	
		if (winningOdds.includes('home_odd') && gameLogObject[0]){
			indexlog = 0;									
		} else if (winningOdds.includes('draw_odd') && gameLogObject[1]){
			indexlog = 1;
		} else if (winningOdds.includes('away_odd') && gameLogObject[2]){
			indexlog = 2;
		}
	}
	console.log('winningOdds',winningOdds);
	//console.log('indexlog',indexlog);
	//console.log('gameLogObject',gameLogObject);
	gameLogObject[indexlog].winclass = 'win';
	logs.push({type:'pari_tableau',gameLogObject:gameLogObject});

	
	console.log("[Bet #%s] Résultat: %s - Mises victorieuses : %s",
		betNumber,printFinalResult(allSites,winningOdds,chosenGame,final_result),printOddTypes(chosenGame,winningOdds));
	logs.push({type:'pari_resultat',msg:`Pari ${betNumber} : Résultat: ${printFinalResult(allSites,winningOdds,chosenGame,final_result)}`});



	// END LOGGING

	allSites.forEach(function (site){

		// CALCUL DES NOUVEAUX SOLDES (NORMAL ET BONUS ET REMAINING)
		site.chosenBets.forEach(function (chosenBet){

			if (chosenBet.sum > 0 && site.site_status === 'just_started'){
				// premier pari fait pour ce site, on passe donc en statut 'ongoing'
				site.site_status = 'ongoing';
			}

			
			if (winningOdds.includes(chosenBet.odd_type)){
				// pari gagnant
				console.log('bonus_status %s bonus_type %s',site.bonus_status,site.bonus_type);

				if (site.bonus_status === 'ongoing' && ['free_lose','free_win_or_lose'].includes(site.bonus_type)) {
					// pari gratuit, on rajoute au solde QUE la différence entre le gain et la mise 
					console.log('AVANT site.solde %s chosenBet.odd %s chosenBet.sum %s',site.solde,chosenBet.odd,chosenBet.sum);
					site.solde = precisionRound(site.solde + (chosenBet.odd * chosenBet.sum - chosenBet.sum),2);
					console.log('APRES site.solde %s',site.solde);

				} else {
					site.solde = precisionRound(site.solde + chosenBet.odd * chosenBet.sum,2);
				}

				
				if (site.bonus_status === 'not yet' && site.bonus_type === 'free_win_or_lose'){
					// si c'est un site avec 'free_win_or_lose', et que le bonus n'était pas encore en usage (premier pari)
					// on met à jour le bonus à valider (bonus_remaining) avec le minimum entre le bonus_limit et la somme misée,
					// multiplié par le nombre de fois où faut le parier
					// on met à jour le solde du bonus (bonus_solde) avec le minimum entre le bonus_limit et la somme misée, 

					site.bonus_remaining = precisionRound(Math.min(site.bonus_limit,chosenBet.sum) * site.times,2);
					site.bonus_solde = precisionRound(Math.min(site.bonus_limit,chosenBet.sum),2);
					site.bonus_status = 'ongoing';
				} else if (site.bonus_status === 'not yet' && 
					['refund','refund_partial_withdrawal','free_lose','none'].includes(site.bonus_type) ) {
					// si c'est un site avec 'refund', 'refund_partial_withdrawal', free_lose', 'none' et que le bonus n'était pas encore en usage (premier pari)
					// on met à jour le bonus à 'done' car on ne pourra pas l'utiliser 
																
					site.bonus_status = 'done';
				} else if (site.bonus_status === 'ongoing'){
					// Si le bonus était en usage, 
					// on met à jour le bonus_remaining avec la différence entre l'ancien bonus_remaining et ce qui a été misé
					
					site.bonus_remaining = precisionRound(Math.max(site.bonus_remaining - chosenBet.sum,0),2);					
				}
				

				console.log("[Bet #%s] Pari gagnant sur",betNumber,site.name);
				logs.push({type:'pari',msg:`Pari ${betNumber} : ${site.name} (Pari Gagnant) - Solde : ${site.solde.toFixed(2)} - Solde Bonus : ${site.bonus_solde.toFixed(2)} - Seuil Bonus restant à valider : ${site.bonus_remaining.toFixed(2)}`});


			} else {
				// pari perdant

				// si le bonus du site n'est pas encore "utilisé" et qu'il n'y a pas de bonus sur le site (PMU)
				if (site.bonus_status === 'not yet' && site.bonus_type === 'none') {
					site.bonus_status = 'done';
				}

				// si le bonus du site est pas encore utilisé, on peut l'activer.																			
				if (site.bonus_status === 'not yet'){
					if (['free_win_or_lose','refund','refund_partial_withdrawal','free_lose'].includes(site.bonus_type)){						
						// on initialise les bonus
						site.bonus_remaining = precisionRound(Math.min(site.bonus_limit,chosenBet.sum) * site.times,2);
						site.bonus_solde = precisionRound(Math.min(site.bonus_limit,chosenBet.sum),2);
						site.bonus_status = 'ongoing';
					} 

				// si le bonus du site est ongoing
				} else if (site.bonus_status === 'ongoing'){
					if (['free_win_or_lose','refund','refund_partial_withdrawal','free_lose'].includes(site.bonus_type)){
						// on met à jour les bonus (le solde et le restant à valider)
						site.bonus_remaining = precisionRound(Math.max(site.bonus_remaining - chosenBet.sum,0),2);						
					}

				}

				logs.push({type:'pari',msg:`Pari ${betNumber} : ${site.name} (Pari Perdant) - Solde : ${site.solde.toFixed(2)} - Solde Bonus : ${site.bonus_solde.toFixed(2)} - Seuil Bonus restant à valider : ${site.bonus_remaining.toFixed(2)}`});
			}
		});

		//site.solde = (site.solde*100)/100;
		//site.bonus_remaining = (site.bonus_remaining*100)/100;
		//site.bonus_solde = (site.bonus_solde*100)/100

		if (site.bonus_remaining === 0){
			site.bonus_status = 'done';
		}

		if (site.bonus_status === 'ongoing' && site.solde === 0 && site.bonus_solde === 0){
			// plus d'argent sur le site, ni en solde ni en bonus, on abandonne et on ferme le site
			site.site_status = 'done';
			console.log("Site %s - Plus d'argent. On passe au site suivant.",site.name);
			logs.push({type:'retrait',msg:`${site.name} - Plus d'argent à parier. On passe au site suivant`});
		}

		if (site.bonus_status === 'done' && site.solde === 0 && site.bonus_solde === 0){
			// plus d'argent sur le site, ni en solde ni en bonus, on abandonne et on ferme le site
			site.site_status = 'done';
			console.log("Site %s - Plus d'argent. On passe au site suivant.",site.name);
			logs.push({type:'retrait',msg:`${site.name} - Plus d'argent à parier. On passe au site suivant`});
		}

		// RETRAIT, LE CAS ECHEANT 

		if ( (site.bonus_status === 'ongoing' && site.bonus_remaining === 0 && (site.solde > 0 || site.bonus_solde > 0))
			|| (site.bonus_status === 'done' && (site.solde > 0 || site.bonus_solde > 0))) {
			// le bonus a été terminé, on peut fermer ce site et remettre l'argent dans la bankroll
			var withdraw = precisionRound(site.solde + site.bonus_solde,2);
			bankroll = precisionRound(bankroll+withdraw,2);
			site.withdraw = precisionRound(site.withdraw + withdraw,2);
			site.site_status = 'done';
			site.solde = 0;
			site.bonus_solde = 0;
			site.bonus_status = 'done';

			console.log("Site %s - Retrait de %s et on passe au site suivant.",site.name,withdraw);
			logs.push({type:'retrait',msg:`${site.name} - Retrait ${withdraw.toFixed(2)} - Bonus validé, on ferme le site, on passe au site suivant`});
		} 

		if ( site.bonus_type === 'free_win_or_lose' && site.bonus_status === 'ongoing' && site.solde > 0) {
			// site de type 'free_win_or_lose' (ex Unibet), en cas de victoire on peut retirer le solde restant
			// et ne garder que le bonus

			var withdraw = site.solde ;
			bankroll = precisionRound(bankroll+withdraw,2);
			site.withdraw = precisionRound(site.withdraw + withdraw,2);
			//site.site_status = 'done';
			site.solde = 0;
			//site.bonus_solde = 0;
			//site.bonus_status = 'done';

			console.log("Site %s - Retrait de %s du solde principal, il ne reste plus que le bonus.",site.name,withdraw);
			logs.push({type:'retrait',msg:`${site.name} - Retrait ${withdraw.toFixed(2)} - On retire le solde principal, on conserve le bonus`});
		} 

		if (site.bonus_type === 'refund_partial_withdrawal' && site.bonus_status === 'ongoing'
				&& (site.solde > site.partial_withdrawal_min || site.bonus_solde > site.partial_withdrawal_min) ){
				
			// site de type 'refund_partial_withdrawal' (ex: France Pari)
			// on peut retirer le solde dispo (normal ou bonus) si celui-ci est supérieur au minimum retirable
			// dans ce cas on retire le minimum pour laisser sur le site (ça peut servir)

			var withdraw = site.partial_withdrawal_min;
			if (site.solde >= site.partial_withdrawal_min){
				site.solde = site.solde - site.partial_withdrawal_min;
			} 
			if (site.bonus_solde >= site.partial_withdrawal_min) {
				site.bonus_solde = site.bonus_solde - site.partial_withdrawal_min;
			}
			bankroll = precisionRound(bankroll+withdraw,2);
			site.withdraw = precisionRound(site.withdraw + withdraw,2);

			console.log("Site %s - Retrait PARTIEL de % du solde normal ou bonus",site.name,withdraw);
			logs.push({type:'retrait',msg:`${site.name} - Retrait ${withdraw.toFixed(2)} - On retire partiellement, on conserve le reste`});
		}


		console.log("[Bet #%s] %s",betNumber,printSiteStatus(site));



	});
	
	console.log("[Bet #%s] Après le pari, la bankroll est de %s",betNumber,bankroll);
	logs.push({type:'bankroll',msg:`Pari ${betNumber} : La bankroll est maintenant de ${bankroll.toFixed(2)}`});

	return bankroll;
}



var findOppositeOddTypes = function (oddtype){
	switch(oddtype) {
		case 'home_odd':
			return ['away_odd','draw_odd'];
		case 'away_odd':
			return ['home_odd','draw_odd'];	        
		case 'draw_odd':
			return ['home_odd','away_odd'];	        
		case 'home_away_odd':
			return ['draw_odd'];	        
		case 'home_draw_odd':
			return ['away_odd'];	        
		case 'away_draw_odd':
			return ['home_odd'];	   
	}
}

var printFinalResult = function(allSites,winningOdds,game,final_result){
	var winningSite = [];
	allSites.forEach(function (site){
		site.chosenBets.forEach(function (chosenBet){
			if (winningOdds.includes(chosenBet.odd_type)){
				winningSite.push(site.name);
			}
		});
	});

	var result = '';

	switch (final_result) {
		case 'H':
			result = game.home_team;
			break;
		case 'D':
			result = 'Nul';
			break;
		case 'A':
			result = game.away_team;
			break;
	}

	return result + ' (' + winningSite + ')';
}

var printSiteStatus = function (site){
	return site.name + ' - Solde: ' + site.solde + ' - Statut Bonus: ' + 
			site.bonus_status + ' - Solde Bonus restant : ' + site.bonus_solde+ ' - Restant à miser pour valider : ' + site.bonus_remaining;
}

var decideRandomFinalResult = function(game){
	var home_odd = game.home_odd;
	var draw_odd = game.draw_odd;
	var away_odd = game.away_odd;

	var home_percent = 100/home_odd;
	var draw_percent = 100/draw_odd;
	var away_percent = 100/away_odd;
	var total_percent = home_percent + draw_percent + away_percent;
	/*console.log('home_percent',home_percent);
	console.log('draw_percent',draw_percent);
	console.log('away_percent',away_percent);
	console.log('total_percent',total_percent);*/


	var final_percent_result = Math.floor(Math.random() * total_percent);
	
	var final_result = 'H';	
	if (final_percent_result > home_percent){
		final_result = 'D';		
	} 
	if (final_percent_result > (home_percent + draw_percent)){
		final_result = 'A';
	}
	return final_result;
}

var findWinningOdds = function(final_result){

	var winningOdds = [];
	switch (final_result){
		case 'H':
			winningOdds.push('home_odd','home_away_odd','home_draw_odd');
			break;
		case 'D':
			winningOdds.push('draw_odd','home_draw_odd','away_draw_odd');
			break;
		case 'A':
			winningOdds.push('away_odd','away_draw_odd','home_away_odd');
	}
	return winningOdds;
}

var printOddTypes = function(game,oddtypes){
	
	if (!Array.isArray(oddtypes)){
		temparray = [oddtypes];
		oddtypes = temparray;
	}

	var printableOddTypes = [];
	oddtypes.forEach(function (oddtype){
		switch(oddtype) {
			case 'home_odd':
				printableOddTypes.push(game.home_team);
				break;
			case 'away_odd':
				printableOddTypes.push(game.away_team);
				break;       
			case 'draw_odd':
				printableOddTypes.push('Nul');
				break;        
			case 'home_away_odd':
				printableOddTypes.push(game.home_team + ' ou ' + game.away_team);
				break;    
			case 'home_draw_odd':
				printableOddTypes.push(game.home_team + ' ou Nul');
				break;   	        
			case 'away_draw_odd':
				printableOddTypes.push(game.away_team + ' ou Nul');
				break;    
		}
	});
	return printableOddTypes;
}

var findRandomBestGame = function(games){
	var nb = games.length;
	var chosen = Math.floor(Math.random() * nb);
	return games[chosen];
};


// this function returns the best game from a list of games
// if mode is 'win' we want an 'easy' game to win so we look for a game 
// 		- whose odd is the closest to suggested_odd
//		- but that odd has to be bigger than chosenSite.bonus_min_odd if bonus_status:'ongoing'
//		- and the smallest odd of the game
// if mode is 'lose' we want a game to lose so we look for a game which odds is the closest to suggested_odd (and where that odd is the biggest one of the game)
// if mode is 'equal' on veut le game avec les cotes les plus equilibrées

var findBestGame = function(games, chosenSite, suggested_odd, mode,doubleChanceForced,betNumber){
	//var nb = games.length;
	//var chosen = Math.floor(Math.random() * nb);

	var smallestOdd = 100;
	var indexSmallestOdd = -1;
	var typeSmallestOdd = '';
	var safeSuggestedOdd = suggested_odd*1.05;

	var minOddProduct = 100;
	

	var doubleChanceOdds = ['home_draw_odd','home_away_odd','away_draw_odd'];
	console.log('[Bet #%s] findBestGame min_odd=%s safeMinOdd=%s mode=%s',betNumber,suggested_odd,safeSuggestedOdd,mode);
	printGames(games,betNumber);

	for (var i = 0; i < games.length ; i++){
		var game = games[i];
		//console.log('[Bet #%s] gamenb=%s',betNumber,i);


		if (mode === 'equal'){
			// case 'equal'
			// on veut les cotes les plus proches possibles - le match le plus équilibré possible
			// TODO: il faut aussi respecter les autres règles: la cote la plus petite du match doit Être plus grande que la cote minimale du bonus (si y a un bonus ongoing)
			// TODO : ou plus grande que la cote minimale du premier pari si c'est le premier pari.

			// on calcule le produit des trois cotes principales
			// le 'game' qui a le plus petit produit 'gagne' 			
			tempOddProduct = game.home_odd * game.away_odd * game.draw_odd;
			if (tempOddProduct < minOddProduct){
				//console.log('[Bet #%s] EQUAL gamenb=%s  tempOddProduct=%s',betNumber,i,tempOddProduct);
				minOddProduct = tempOddProduct;
				indexSmallestOdd = i;
			}

		} else {
			// case 'win' or 'lose'
			// on veut gagner ou perdre un match	
			for (var oddprop in game._doc){
				if (!game.hasOwnProperty(oddprop) &&  ( oddprop.includes('odd'))) {

				
					if (Math.abs(game[oddprop]-safeSuggestedOdd) < Math.abs(smallestOdd-safeSuggestedOdd) 
							&& (chosenSite.bonus_status !== 'ongoing' || (chosenSite.bonus_status === 'ongoing' && game[oddprop] >= chosenSite.bonus_min_odd) )
							&& (chosenSite.site_status !== 'just_started' || (chosenSite.site_status === 'just_started' && game[oddprop] >= chosenSite.first_bet_min_odd) ) 
						) {
						// la cote est plus proche de suggestedOdd que la 'plus proche' cote trouvée jusque maintenant
						// si le chosenSite.bonus_status est 'ongoing', on regarde si la cote est plus grande que la cote minimale du bonus
						// si le chosenSite.site_status est 'just_started', on regarde si la cote est plus grande que la cote minimale du PREMIER pari

						
						if (  (doubleChanceForced && doubleChanceOdds.includes(oddprop)) 
								|| (!doubleChanceForced && !doubleChanceOdds.includes(oddprop)) ) {
							// le type de cote est autorisé
							// si pari double chance forcé, seules les cotes doubles chances sont autorisées
							// si non, seules les cotes non double chance sont autorisées
							
							// mode 'WIN' on veut que cette odd soit la plus petite disponible de toutes les odds de ce game
							// mode 'LOSE' on veut que cette odd soit la plus grande disponible de toutes les odds de ce game

							// TODO 29 mai: avant on avait des soucis dès le BET 1, maintenant c'est au bet 4 donc y a des progrès à faire, 
							// mais l'erreur est la même quoiqu'il arrive (je veux dire entre Mac et PC)
							// TODO 31 mai: ça va mieux mais y a très très peu de TRUE
							// peut-être au début printer la liste de games available? et rajouter une méthode printGameStatus ou algo !?!?!?
							// TODO 31 mai soirée voir Evernote chemin 'Probleme DEV EN COURS'
							var isBestOdd = true;
							for (var oddtemp in game._doc){
								if (!game.hasOwnProperty(oddtemp) && ( oddtemp.includes('odd'))) {
									// la première condition du 'if' c'est pour éviter de comparer une odd avec elle-même...
									// et ensuite les autres conditions c'est pour comparer les cotes double chance entre elles, et les non double chance entre elles
									if (oddtemp !== oddprop && 
										( 	( doubleChanceOdds.includes(oddprop) && doubleChanceOdds.includes(oddtemp)) || 
											( !doubleChanceOdds.includes(oddprop) && !doubleChanceOdds.includes(oddtemp))))									 
									{
										//console.log('[Bet #%s] gamenb=%s oddprop=%s oddtemp=%s mode=%s game[oddtemp]=%s game[oddprop]=%s doubleChanceOdds.includes(oddprop)=%s doubleChanceOdds.includes(oddtemp)=%s',
										//		betNumber,i,oddprop,oddtemp,mode,game[oddtemp],game[oddprop],doubleChanceOdds.includes(oddprop),doubleChanceOdds.includes(oddtemp));
										if ( ( mode === 'win' && game[oddtemp] < game[oddprop])
											|| (mode === 'lose' && game[oddtemp] > game[oddprop])) {
											isBestOdd = false;
											//console.log('isBestOdd (oddtemp=%s oddprop=%s) FALSE',oddtemp,oddprop);
											

										}
									}
								}
								
							}

							// on rajoute la cote que si c'est la 'meilleure'
							if (isBestOdd){
								//console.log('[Bet #%s] isBestOdd TRUE for gamenb=%s oddprop=%s game[oddprop]=%s',betNumber,i,oddprop,game[oddprop]);
								smallestOdd = game[oddprop];
								indexSmallestOdd = i;
								typeSmallestOdd = oddprop;					
							}
						}					
					}
				}
			}
		}
	}

	if (mode === 'equal'){
		// the game is chosen, we have to chose the smallest odd for that game
		var chosenGame = games[indexSmallestOdd];

		for (var oddprop in chosenGame._doc){
			if (  (doubleChanceForced && doubleChanceOdds.includes(oddprop)) 
					|| (!doubleChanceForced && !doubleChanceOdds.includes(oddprop)) ) {
				// le type de cote est autorisé
				// si pari double chance forcé, seules les cotes doubles chances sont autorisées
				// si non, seules les cotes non double chance sont autorisées
				if (!chosenGame.hasOwnProperty(oddprop) &&  ( oddprop.includes('odd'))) {
					// on veut la plus petite cote
					if (chosenGame[oddprop] < smallestOdd){
						typeSmallestOdd = oddprop;
						smallestOdd = chosenGame[oddprop];
					}
				}
			}
		}
		console.log('[Bet #%s] EQUAL chosenGame=%s typeSmallestOdd=%s',betNumber,indexSmallestOdd,typeSmallestOdd);
	}


	return {index:indexSmallestOdd,odd_type:typeSmallestOdd};
}

var printGames = function(games,betNumber){
	for (var i = 0; i < games.length ; i++){
		var game = games[i];
		console.log('[Bet #%s][Game #%s] %s - %s (1:%s - X:%s - 2:%s - 1X:%s - 2X:%s - 12:%s',
			betNumber,i,game.home_team,game.away_team,game.home_odd,game.draw_odd,game.away_odd,game.home_draw_odd,game.away_draw_odd,game.home_away_odd);
	}
}

/* 	return the index in the list of sites
   	of the best site for a given bonus_type
	the best site fills the following conditions :
	- if only one found, it is that best site
	- if more than one, we look for the one with the highest 'times' and if more than one, the highest bonus_min_odd

	TODO : the best site should be the one with the validation conditions closed to be done
	la méthode ne devrait pas faire selon le 'bonus_type' mais juste renvoyer le meilleur site tout bonus confondu
	après c'est tout l'intêrét de l'algorithme, comment évaluer cela....

*/
var findBestSiteWithBonusType = function (sites,bonus_type){
	var bestSitesNb = [];

	for (var i = 0; i < sites.length; i++){
		if (sites[i].bonus_type === bonus_type){
			bestSitesNb.push(i);
		}
	}

	if (bestSitesNb.length === 0){
		// not found
		return -1;
	} else if (bestSitesNb.length === 1){
		// we rturn that site number
		return bestSitesNb[0];

	} else {
		// we look for the sites with the highest 'times'
		var highestTimes = -1 ;
		var highestTimesSitesNb = [];

		for (var i = 0; i < bestSitesNb.length; i++){
			var site = sites[bestSitesNb[i]];

			if (site.times > highestTimes){
				highestTimes = site.times;
				highestTimesSitesNb = [i];
			} else if (site.times === highestTimes){
				highestTimesSitesNb.push(i);
			}
		}

		if (highestTimesSitesNb.length === 1){
			return highestTimesSitesNb[0];
		} else {
			// more than 1, we take the one with the highest odd
			var highestOdd = -1;
			var highestOddSitesNb = [];

			for (var i = 0; i < highestTimesSitesNb.length; i++){
				var site = sites[highestTimesSitesNb[i]];

				if (site.bonus_min_odd > highestOdd){
					highestOdd = site.times;
					highestOddSitesNb = [i];
				} else if (site.bonus_min_odd === highestOdd){
					highestOddSitesNb.push(i);
				}
			}

			// we return the first one in the list, whatever
			return highestOddSitesNb[0];
		}
	}
	
}

var getOtherSites = function(sites,foundIndex){
	var otherSites = [];
	var otherSiteNames = [];
	for (var i = 0; i < sites.length;i++){
		if (i != foundIndex){
			otherSites.push(sites[i]);
			otherSiteNames.push(sites[i].name);
		}
	}
	return {
		sites: otherSites,
		names: otherSiteNames
	}
}

/* 	return the index in the list of sites
   	of the best site according to the conditions
   	if several sites, we take the one with highest bonus conditions

   	sites : list of sites through which to find ...
   	TODO : cette recherche devrait être aussi faite sur les not yet sites non? 
   	bonus_type : le type de bonus que le site doit remplir
   	bonus_status: le statut du bonus
   	all_sites: si tous les sites de la liste doivent remplir ces conditions pour renvoyer un site
   	min_bonus_min_odd : la cote minimum pour le bonus
   	min_times: le nombre de fois minimum à parier le bonus (le site doit remplir l'une des deux conditions)

*/
var findSitesWithConditions = function (sites,goal,bonus_type,bonus_status,all_sites,min_bonus_min_odd,min_times,betNumber){
	var bestSitesNb = [];
	console.log('[Bet #%s] findSitesWithConditions - looking between %s sites',betNumber,sites.length);

	for (var i = 0; i < sites.length; i++){
		var site = sites[i];
		if ( (!bonus_type || site.bonus_type === bonus_type)
			&& (!bonus_status || site.bonus_status === bonus_status) 
			&& (site.bonus_min_odd >= min_bonus_min_odd || site.times >= min_times)){
			bestSitesNb.push(i);
		}
	}

	console.log('[Bet #%s] findSitesWithConditions - site indices respecting the conditions',betNumber,bestSitesNb);

	if (all_sites && bestSitesNb.length !==sites.length) {
		// tous les sites doivent remplir ces conditions
		// mais il n'y a pas tous les sites
		// on renvoit donc aucun site
		console.log('[Bet #%s] findSitesWithConditions - Aucun site renvoyé car tous les sites doivent remplir les conditions',betNumber);
		return -1;
	}

	// TODO : pour l0instant on retourne le site avec le highest bonus condition
	// MAIS C'EST CON... POURQUOI FAIRE? 
	// SI ON VEUT GAGNER (mode win) IL FAUT LOGIQUEMENT RENVOUER AVEC LE SMALLEST BONUS CONDITION
	// SI ON VEUT PERDRE (mode lose) IL FAUT LOGIQUEMENT RENVOUER LE SITE AVEC LE HIGHEST ONUS CONDITION
	// D'AILLEURS EN PREMIER IL FAUDRAIT AUSSI ESSAYER D'UTILISER LE BONUS RESTANT A VALIDER COMME CRITERE NON NON NON NON NON NON NON NON NON NON??!?!??!?!?!?!??!?!?!?!?!
	// VOIR SUR LE for au-dessus non ?!

	if (bestSitesNb.length === 0){
		// not found
		console.log('[Bet #%s] findSitesWithConditions - Aucun site trouvé qui respecte les conditions de base :',betNumber);
		return -1;
	} else if (bestSitesNb.length === 1){
		// we rturn that site number
		console.log('[Bet #%s] findSitesWithConditions - Un seul site trouvé qui respecte les conditions de base :',betNumber,bestSitesNb[0].name);
		return bestSitesNb[0];

	} else {
		// on a plus d'un site

		// si le bonus_status est ongoing, et si :
		// - mode 'win' : on prend le site avec le bonus restant à valider le plus PETIT (car on veut gagner sur ce site)
		// - mode 'lose': on prend le site avec le bonus restant à valider le plus GRAND (car on veut perdre sur ce site qui a un trop gros bonus restant)
		var bestRemainingBonus = (goal === 'win') ? 1000 : -1000;
		var bestRemainingBonusSitesNb = [];

		if (bonus_status === 'ongoing'){

			for (var i = 0; i < bestSitesNb.length; i++){
				var site = sites[bestSitesNb[i]];

				if ( (goal === 'win' && site.bonus_remaining < bestRemainingBonus)
						|| (goal === 'lose' && site.bonus_remaining > bestRemainingBonus) ) {
					bestRemainingBonus = site.bonus_remaining;
					bestRemainingBonusSitesNb = [i];
				} else if (site.bonus_remaining === bestRemainingBonus){
					bestRemainingBonusSitesNb.push(i);
				}
			}
		}

		if (bestRemainingBonusSitesNb.length === 1){
			// on a trouvé un seul site avec le remaining bonus plus intéressant
			console.log('[Bet #%s] findSitesWithConditions - Mode %s - Un site trouvé (meilleur bonus restant) :',betNumber,goal,bestRemainingBonusSitesNb[0].name);
			return bestRemainingBonusSitesNb[0];
		} 

		// dans les autres cas, on regarde les nombre de fois à parier et la cote minimale à parier. LEs autres cas sont :
		// - pas de bonus_status 'ongoing' 
		// - ou bien plusieurs sites avec le bonus 'ongoing' mais avec le même bonus restant à valider



		// si on est en mode 'win' on prend le bonus le moins compliqué		
		// si on est en mode 'lose' on prend le bonus le plus compliqué 
		var bestTimes = (goal === 'win') ? 10 : -10;
		var bestTimesSitesNb = [];

		for (var i = 0; i < bestSitesNb.length; i++){
			var site = sites[bestSitesNb[i]];

			if ( (goal === 'win' && site.times < bestTimes)
					|| (goal === 'lose' && site.times > bestTimes) ) {
				bestTimes = site.times;
				bestTimesSitesNb = [i];
			} else if (site.times === bestTimes){
				bestTimesSitesNb.push(i);
			}
		}

		if (bestTimesSitesNb.length === 1){
			console.log('[Bet #%s] findSitesWithConditions - Mode %s - Un site trouvé (meilleur nb de paris) :',betNumber,goal,bestTimesSitesNb[0].name);
			return bestTimesSitesNb[0];
		} else {
			// plus d'un site avec la "meilleure" fréquence/times, on cherche donc maintenant la "meilleure" cote
			var bestOdd = (goal === 'win') ? 10 : -10;
			var bestOddSitesNb = [];

			for (var i = 0; i < bestTimesSitesNb.length; i++){
				var site = sites[bestTimesSitesNb[i]];

				if ( (goal === 'win' && site.bonus_min_odd < bestOdd)
					|| (goal === 'lose' && site.bonus_min_odd > bestOdd) ) {
					bestOdd = site.bonus_min_odd;
					bestOddSitesNb = [i];
				} else if (site.bonus_min_odd === bestOdd){
					bestOddSitesNb.push(i);
				}
			}

			// we return the first one in the list, whatever
			console.log('[Bet #%s] findSitesWithConditions - Mode %s - Nb de sites trouvés (meilleur nb de paris et meilleure cote) :',betNumber,goal,bestOddSitesNb.length);
			return bestOddSitesNb[0];
		}
	}
	
}



var findBestSiteWithBonusTypeAndBestGame = function(sites,games,betNumber){
	var chosenSite;
	var otherSites;
	var logBonusType = '';
	var chosenGameObj;

	var bestSiteConditionsInOrder = [
		{desc:'Bonus pas encore commencé et beaucoup de conditions (Pari Remboursé Partiel)',goal:'win',suggested_game_odd:2.7,// 2
			bonus_type:'refund_partial_withdrawal',bonus_status:'not yet',all_sites:false,min_bonus_min_odd:1,min_times:3},
		{desc:'Bonus pas encore commencé et beaucoup de conditions (Pari Remboursé non Partiel)',goal:'win',suggested_game_odd:1.6,// 2
			bonus_type:'refund',bonus_status:'not yet',all_sites:false,min_bonus_min_odd:1,min_times:3},
		{desc:'Bonus pas encore commencé et beaucoup de conditions (Autre que Pari Remboursé)',goal:'win',suggested_game_odd:1.7,// 2
			bonus_type:null,bonus_status:'not yet',all_sites:false,min_bonus_min_odd:1,min_times:3},
		{desc:'Pari Gratuit si perdant ou gagnant',goal:'win',suggested_game_odd:1.7, //1.5
			bonus_type:'free_win_or_lose',bonus_status:'not yet',all_sites:false,min_bonus_min_odd:0,min_times:0},
		{desc:'Pari Gratuit si perdant',goal:'win',suggested_game_odd:2, //2
			bonus_type:'free_lose',bonus_status:'not yet',all_sites:false,min_bonus_min_odd:0,min_times:0},
		{desc:'Pari Remboursé (Retrait Partiel) en cours sur tous les sites, avec conditions',goal:'win',suggested_game_odd:2, //2
			bonus_type:'refund_partial_withdrawal',bonus_status:'ongoing',all_sites:true,min_bonus_min_odd:1,min_times:1},
		{desc:'Pari Remboursé (Retrait Partiel) en cours avec conditions',goal:'lose',suggested_game_odd:3.5, //3.5
			bonus_type:'refund_partial_withdrawal',bonus_status:'ongoing',all_sites:false,min_bonus_min_odd:1,min_times:1},
		{desc:'Pari Remboursé en cours sur tous les sites, avec conditions',goal:'win',suggested_game_odd:2, //2
			bonus_type:'refund',bonus_status:'ongoing',all_sites:true,min_bonus_min_odd:1,min_times:1},
		{desc:'Pari Remboursé en cours avec conditions',goal:'lose',suggested_game_odd:3.5, //3.5
			bonus_type:'refund',bonus_status:'ongoing',all_sites:false,min_bonus_min_odd:1,min_times:1}
	]

	// le pari double chance est autorise uniquement si c'est le premier pari
	// et si y a que deux sites
	// sinon, non (car c'est pas rentable réellement)
	var doubleChanceForced = (betNumber === 1 && sites.length <= 2);

	for (let condition of bestSiteConditionsInOrder){
		console.log('[Bet #%s] Condition',betNumber,condition.desc);
		var foundIndex = findSitesWithConditions(sites,condition.goal,condition.bonus_type,condition.bonus_status,condition.all_sites,condition.min_bonus_min_odd,condition.min_times,betNumber);
		if (foundIndex > -1){
			// on va essayer de gagner sur ce site
			chosenSite = sites[foundIndex];
			var otherSitesObj = getOtherSites(sites,foundIndex);
			otherSites = otherSitesObj.sites;
			var otherSiteNames = otherSitesObj.names;

			var firstText = 'gagner';
			var secondText = 'perdre';
			if (condition.goal === 'lose'){
				firstText = 'perdre';
				secondText = 'gagner'
			}

			console.log('[Bet #%s] %s - Pari sur les sites suivants : %s et %s',betNumber,condition.desc,chosenSite.name,otherSiteNames);
			logBonusType = `Pari ${betNumber} : On va tenter de ${firstText} le pari sur ${chosenSite.name} (${condition.desc}) et le ${secondText} sur ${otherSiteNames}`;
			
			// FIND GAME
		
			chosenGameObj = findBestGame(games,chosenSite,condition.suggested_game_odd,condition.goal,doubleChanceForced,betNumber);

			break;
		}
	}

	if (!chosenGameObj){
		// aucune préférence
		chosenSite = sites[0];
		var otherSitesObj = getOtherSites(sites,0);
		otherSites = otherSitesObj.sites;
		var otherSiteNames = otherSitesObj.names;

		console.log('[Bet #%s] Autre - Pari sur les sites suivants : %s et %s',betNumber,chosenSite.name,otherSiteNames);
		logBonusType = `Pari ${betNumber} : Aucune stratégie, on s'en fiche. On va parier sur ${chosenSite.name} et sur ${otherSiteNames}`;
			
		
		chosenGameObj = findBestGame(games,chosenSite,null,'equal',doubleChanceForced,betNumber);
	}


	return {
		chosenSite : chosenSite,
		otherSites : otherSites,
		logBonusType : logBonusType,
		chosenGameObj : chosenGameObj
	};


}

var decideBets = function(chosenSite,otherSites,games,chosenGame,
	chosenOddType,logs,logBonusType,gameLogObject,betNumber){
	
	
	console.log('[Bet #%s] %s : %s - %s',
		betNumber,moment(chosenGame.date).format('DD MMM'),chosenGame.home_team,chosenGame.away_team);
	logs.push({type:'pari_important',msg:`Pari ${betNumber} : Match du ${moment(chosenGame.date).format('DD MMM')} entre ${chosenGame.home_team} et ${chosenGame.away_team} `});
	// on rajoute le sgams dans le log push
	logs.push({type:'games',games:games,betNumber:betNumber});
	logs.push({type:'pari',msg:logBonusType});

	
	// ######################
	// CHOOSE BETS SUMS
	// ######################


	// ################################
	// Chosen bet for the 'chosen' site
	// ################################

	var chosenSiteBetMax = 5000;
	// si on est en bonus ongoing, et qu'il reste du bonus à valider, on va essayer de parier cette somme 
	if (chosenSite.bonus_status === 'ongoing' && chosenSite.bonus_remaining > 0) {
		chosenSiteBetMax = chosenSite.bonus_remaining;
	}
	// on regarde aussi le solde des other sites
	// la somme à parier ne peut pas être plus de X fois supérieure au solde maximum des sites restants
	var maxTempSolde = -100;
	otherSites.forEach(function (otherSite){
		if (otherSite.solde + otherSite.bonus_solde > maxTempSolde){
			maxTempSolde = otherSite.solde + otherSite.bonus_solde;
		}
	});
	//console.log('maxTempSolde',maxTempSolde);
	chosenSiteBetMax = Math.min(chosenSiteBetMax,maxTempSolde * BET_DIFFERENCE_FACTOR);

	var chosenSiteBet = 0;
	if (chosenSite.solde > 0){
		chosenSiteBet = Math.min(chosenSite.solde,chosenSiteBetMax);
		chosenSite.chosenBets = [{
			odd : chosenGame[chosenOddType],
			odd_type : chosenOddType,
			sum : chosenSiteBet,
			using_bonus_solde : false
		}]
		chosenSite.solde = chosenSite.solde - chosenSiteBet;
	} else {
		chosenSiteBet= Math.min(chosenSite.bonus_solde,chosenSiteBetMax);
		// on utilise le solde du bonus
		chosenSite.chosenBets = [{
			odd : chosenGame[chosenOddType],
			odd_type : chosenOddType,
			sum : chosenSiteBet,
			using_bonus_solde : true
		}]
		chosenSite.bonus_solde = chosenSite.bonus_solde - chosenSiteBet;
	}

	var maxPossibleBet = chosenSiteBet * BET_DIFFERENCE_FACTOR;
	
	// ################################
	// Chosen bet for the other site(s)
	// ################################

	var otherSitesOddTypes = findOppositeOddTypes(chosenOddType);

	if (otherSites.length === 1){
		// un seul autre site, c'est donc un DOUBLE PARI sur un site et deux résultats
		// sauf si c'est un pari double chance
		var otherSite = otherSites[0];

		var otherSiteBetMax = 5000;	

		// console.log('chosenSiteBet',chosenSiteBet);
		// console.log('otherSiteBetMax',otherSiteBetMax);
		// si on est en bonus ongoing, et qu'il reste du bonus à valider, on va essayer de parier cette somme 
		if (otherSite.bonus_status === 'ongoing' && otherSite.bonus_remaining > 0) {
			otherSiteBetMax = otherSite.bonus_remaining;
		}

		var otherSiteSum = 0;
		var otherSiteUsingBonusSolde = false;
		if (otherSite.solde > 0){
			var bet = Math.min(otherSite.solde,otherSiteBetMax,maxPossibleBet);
			otherSiteSum = bet;
			otherSite.solde = otherSite.solde - bet;
		} else {
			// on utilise le bonus
			var bet = Math.min(otherSite.bonus_solde,otherSiteBetMax,maxPossibleBet);
			otherSiteSum = bet;
			otherSite.bonus_solde = otherSite.bonus_solde - bet;
			otherSiteUsingBonusSolde = true;
		}

		otherSite.chosenBets = [];

		if (otherSitesOddTypes.length === 1){
			// pour l'autre site c'est un pari double chance
			// donc ici il n'y a qu'un seul pari
			otherSite.chosenBets.push({
				odd : chosenGame[otherSitesOddTypes[0]],
				odd_type : otherSitesOddTypes[0],
				sum : otherSiteSum,
				using_bonus_solde : otherSiteUsingBonusSolde
			});
		}

		if (otherSitesOddTypes.length > 1){
			// pari "normal" sur le premier site
			// donc double pari sur l'autre site
			// TODO : à modifier pour prendre en compte les "dépassements" de bonus solde...
			var firstResultOdd = chosenGame[otherSitesOddTypes[0]];
			var secondResultOdd = chosenGame[otherSitesOddTypes[1]];

			var firstSiteSum = (otherSiteSum*secondResultOdd)/(firstResultOdd+secondResultOdd);
			var secondSiteSum = (otherSiteSum*firstResultOdd)/(firstResultOdd+secondResultOdd);

			otherSite.chosenBets.push({
				odd : firstResultOdd,
				odd_type : otherSitesOddTypes[0],
				sum : firstSiteSum,
				using_bonus_solde : otherSiteUsingBonusSolde
			});
			otherSite.chosenBets.push({
				odd : secondResultOdd,
				odd_type : otherSitesOddTypes[1],
				sum : secondSiteSum,
				using_bonus_solde : otherSiteUsingBonusSolde
			});

			// si il reste deux résultats avec une cote c1 et c2, et que la somme totale est s, 
			// alors s2 (mise sur le deuxème resultat) = (s*c1)/(c1+c2)
		} 

	} else if (otherSites.length === 2){
		// DEUX AUTRES SITES
		// donc un pari sur chaque site
		// pour l'instant on parie en fonction des soldes restant sur chaque site
		// TODO: 
		//		improvement: on devrait choisir mieux chaque pari sur chaque site
		// 		en ayant conscience des sites, des bonus restant à valider...
		// 		y a forcément des sites où on veut perdre
		//		
		
		for (var i = 0; i < otherSites.length;i++){
			var otherSite = otherSites[i];
			
			var otherSiteBetMax = chosenSiteBet * BET_DIFFERENCE_FACTOR;
			
			//console.log('chosenSiteBet',chosenSiteBet);
			//console.log('otherSiteBetMax',otherSiteBetMax);
			// si on est en bonus ongoing, et qu'il reste du bonus à valider, on va essayer de parier cette somme 
			if (otherSite.bonus_status === 'ongoing' && otherSite.bonus_remaining > 0) {
				otherSiteBetMax = otherSite.bonus_remaining;
			}

			var otherSiteSum = 0;
			var otherSiteUsingBonusSolde = false;
			if (otherSite.solde > 0){
				var bet = Math.min(otherSite.solde,otherSiteBetMax,maxPossibleBet);
				otherSiteSum = bet;
				otherSite.solde = otherSite.solde - bet;
			} else {
				// on utilise le bonus
				var bet = Math.min(otherSite.bonus_solde,otherSiteBetMax,maxPossibleBet);
				otherSiteSum = bet;
				otherSite.bonus_solde = otherSite.bonus_solde - bet;
				otherSiteUsingBonusSolde = true;
			}

			otherSite.chosenBets = [];

			// normalement il y aura bien deux other Sites odd Types
			// car forcément le premier site n'aura pas un pari double chance

			otherSite.chosenBets.push({
				odd : chosenGame[otherSitesOddTypes[i]],
				odd_type : otherSitesOddTypes[i],
				sum : otherSiteSum,
				using_bonus_solde : otherSiteUsingBonusSolde
			});
		};
	}

	// LOGGING (....)
	
	gameLogObject[3] = false;

	var allSites = [];
	allSites.push(chosenSite);
	otherSites.forEach(function(otherSite){
		allSites.push(otherSite);
	});

	allSites.forEach(function(site){
		//console.log('[Bet #%s] Site %s - Détails:',betNumber,site.name,site);
		site.chosenBets.forEach(function (chosenBet){
			console.log('[Bet #%s] Site %s - Pari sur %s - Cote %s - Somme %s (%s)',
				betNumber,site.name,printOddTypes(chosenGame,chosenBet.odd_type),chosenBet.odd,chosenBet.sum,(chosenBet.using_bonus_solde === true)? 'Bonus':'Solde normal');
			//logs.push({type:'pari',msg:`Pari ${betNumber} : Site ${site.name} - On va parier ${chosenBet.sum} € (${(chosenBet.using_bonus_solde === true)? 'Bonus':'Solde normal'}) sur ${printOddTypes(chosenGame,chosenBet.odd_type)} à une côte de ${chosenBet.odd}`});
			var indexlog = 0;
			if (chosenBet.odd_type === 'home_odd' || chosenBet.odd_type === 'home_draw_odd'){
				indexlog = 0;
			} else if (chosenBet.odd_type === 'draw_odd' || chosenBet.odd_type === 'away_draw_odd'){
				indexlog = 1;
			} else if (chosenBet.odd_type === 'away_odd' || chosenBet.odd_type === 'home_away_odd'){
				indexlog = 2;
			} 
			if ((chosenBet.odd_type === 'home_draw_odd') || (chosenBet.odd_type === 'away_draw_odd') || (chosenBet.odd_type === 'home_away_odd')){
				gameLogObject[3] = true;
			}

			var gains = chosenBet.odd * chosenBet.sum - chosenBet.sum;


			gameLogObject[indexlog] = {
				site : site.name, 
				bonus_type: site.bonus_type,
				using_bonus_solde : chosenBet.using_bonus_solde,
				site_status : site.site_status,
				odd:chosenBet.odd, 
				who:printOddTypes(chosenGame,chosenBet.odd_type), 
				bet:chosenBet.sum.toFixed(2),
				gains:gains.toFixed(2),
				using_bonus_solde_text : ((chosenBet.using_bonus_solde === true)? 'Bonus':'Solde normal'),
				winclass:''
			};
		});
	});


	// calculating GAB
	var payout = 0;
	for (var i = 0; i <=2;i++){
		if (gameLogObject[i]){
			var baseObj = gameLogObject[i];
			var gab = baseObj.gains;
			// cas où c'est un pari gratuit + on joue le bonus : on enlève la mise initiale car on la perd
			if (['free_win_or_lose','free_lose'].includes(baseObj.bonus_type) && baseObj.using_bonus_solde){
				gab = gab - baseObj.bet;
			}

			// on browse les autres paris
			for (var j = 0; j <= 2; j++){
				if (i != j && gameLogObject[j]){
					// les autres !!! 

					// on perd le montant de la mise de ce site
					// SAUF si c'est un bonus remboursé, et qu'on est en train en mode just_started (premier pari remboursé)
					var otherObj = gameLogObject[j];
					if (!(['refund','refund_partial_withdrawal'].includes(otherObj.bonus_type) && ['just_started'].includes(otherObj.site_status))) {
						gab = gab - otherObj.bet;
					}
				}
			}

			baseObj.gab = precisionRound(gab,2);

			payout += 1 / baseObj.odd;

		}
	}
	// update payout
	for (var i = 0; i <=2;i++){
		if (gameLogObject[i]){
			gameLogObject[i].payout = precisionRound(payout*100,0);
		}
	}



}

var precisionRound = function (number, precision) {
  var factor = Math.pow(10, precision);
  return Math.round(number * factor) / factor;
}

//console.log(precisionRound(1234.5678, 1));
// expected output: 1234.6

//console.log(precisionRound(1234.5678, -1));
// expected output: 1230




/* 	return the index in the list of sites
   	of the best site for a given bonus_type
	the best site fills the following conditions :
	- if only one found, it is that best site
	- if more than one, we look for the one with the highest 'times' and if more than one, the highest bonus_min_odd

	TODO : the best site should be the one with the validation conditions closed to be done
	la méthode ne devrait pas faire selon le 'bonus_type' mais juste renvoyer le meilleur site tout bonus confondu
	après c'est tout l'intêrét de l'algorithme, comment évaluer cela....

*/
var findBestSiteWithBonusType = function (sites,bonus_type){
	var bestSitesNb = [];

	for (var i = 0; i < sites.length; i++){
		if (sites[i].bonus_type === bonus_type){
			bestSitesNb.push(i);
		}
	}

	if (bestSitesNb.length === 0){
		// not found
		return -1;
	} else if (bestSitesNb.length === 1){
		// we rturn that site number
		return bestSitesNb[0];

	} else {
		// we look for the sites with the highest 'times'
		var highestTimes = -1 ;
		var highestTimesSitesNb = [];

		for (var i = 0; i < bestSitesNb.length; i++){
			var site = sites[bestSitesNb[i]];

			if (site.times > highestTimes){
				highestTimes = site.times;
				highestTimesSitesNb = [i];
			} else if (site.times === highestTimes){
				highestTimesSitesNb.push(i);
			}
		}

		if (highestTimesSitesNb.length === 1){
			return highestTimesSitesNb[0];
		} else {
			// more than 1, we take the one with the highest odd
			var highestOdd = -1;
			var highestOddSitesNb = [];

			for (var i = 0; i < highestTimesSitesNb.length; i++){
				var site = sites[highestTimesSitesNb[i]];

				if (site.bonus_min_odd > highestOdd){
					highestOdd = site.times;
					highestOddSitesNb = [i];
				} else if (site.bonus_min_odd === highestOdd){
					highestOddSitesNb.push(i);
				}
			}

			// we return the first one in the list, whatever
			return highestOddSitesNb[0];
		}
	}
	
}

/**
app.get('/listofgames',function(req,res){
	const loopFrom = moment('2017-01-13');
	const loopUntil = moment('2017-05-21');
	const intervalOfDays = 3;
	var tempBegin = moment(loopFrom);
	var tempEnd = moment(tempBegin).add(intervalOfDays,'days');
	
	var processBegin = moment();
    

	var chosenGames = [];

	async.doWhilst(
		function dofunction(callback){
			//console.log('dates',tempBegin,tempEnd);

			Games.findBetweenDates(tempBegin,tempEnd,function(err,result){
				console.log('nb of games found between %s and %s :',tempBegin.format('DD MMM'),tempEnd.format('DD MMM'),result.length);
				if (result && result.length > 4){
					var chosenGame = findRandomBestGame(result);
					console.log('chosen game : %s %s-%s',moment(chosenGame.date).format('DD MMM'),chosenGame.home_team,chosenGame.away_team);
					chosenGames.push(chosenGame);
					tempBegin = moment(chosenGame.date).add(2,'days');
					tempEnd = moment(tempBegin).add(2+intervalOfDays,'days');
					callback();
				} else {
					tempEnd = moment(tempEnd).add(1,'days');
					callback();
				}
			});
		},
		function whilefunction(){
			return tempEnd.isSameOrBefore(loopUntil);
		},
		function afterfunction(){
			res.render('games',{games:chosenGames});

			var processEnd = moment();    		
	    	var elapsed = processEnd.diff(processBegin,'SSS');
	    	console.log('List of Games displayed. Time elapsed: %s milliseconds',elapsed);
		}
	);


});
*/

app.get('/games', function (req, res) {
  
  
  Games.Games.find({},{},{sort:{date:1}},function(err,result){
  	console.log('games found',JSON.stringify(result));
  	//res.send(result);
  	res.render('games',{games:result});
  });

  

});

app.get('/bettingsites', function (req, res) {
  
  resetOngoingSites();
  createNewSites(1);
  setTimeout( function(){
	  	OngoingSites.find({},{},{sort:{order_pierre:1}},function(err,result){
		  	console.log('nb of ongoingsites found',result.length);
		  	res.render('bettingsites',{sites:result});
	  	});


  	},100);
  

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
	  BettingSites.reset();
	});
});

module.exports = app;