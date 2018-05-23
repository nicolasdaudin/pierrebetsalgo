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

var simulateManyMembers = function(iterNb,callbackWhilstManyIterations){
	
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
		function dofunction(callbackDoWhilst){
			//console.log('dates',tempBegin,tempEnd);

			Games.findBetweenDates(tempBegin,tempEnd,function(err,games){
				console.log('[Bet #%s] Nb of games found between %s and %s :',betNumber,tempBegin.format('DD MMM'),tempEnd.format('DD MMM'),games.length);
				if (games && games.length > 4){

					// ######## DECIDER DES SITES SUR LESQUELS ON PARIE - SI BESOIN, EN OUVRIR UN NOUVEAU
					// VOIR LES SITES AVAILABLE
					OngoingSites.find({iterNb:iterNb,site_status:'ongoing'},function(err,ongoingsites){
						async.waterfall([

							function decideSites(callbackDecideSites){
								if ( !ongoingsites || ongoingsites.length === 0 || ongoingsites.length === 1){
									// aucun site, on est probablement au début, il faut rajouter des sites
									// ou bien un seul site, on est plus au début, on rajoute quand même deux sites

									// pour l'instant, on prend les deux premies sites 'not yet' de la liste de Pierre
									OngoingSites.find({iterNb:iterNb,site_status:'not yet'},{},{sort:{order_pierre:1},limit:2},function(err,notyetsites){

										if (!notyetsites || notyetsites.length === 0){
											// no more 'not yet' sites either, it means we are done with all the sites
											console.log('[Bet #%s] NO MORE SITES, WE STOP',betNumber);
											logs.push({type:'site',msg:'Plus de site disponible, simulation terminée'});
											noMoreAvailableSites = true;
											callbackDoWhilst();

										} else if (notyetsites && notyetsites.length === 1){
											// no more 'not yet' sites either, it means we are done with all the sites
											console.log('[Bet #%s] ONLY ONE SITE LEFT, WE STOP',betNumber);											
											logs.push({type:'site',msg:'Plus qu\'un seul site dispo, simulation terminée'});
											noMoreAvailableSites = true;
											callbackDoWhilst();
										} else {

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
														chooseSiteNb = 0;
													} else if (firstSite.times > secondSite.times){
														chosenSiteNb = 1;
													} else {
														// même nombre de paris pour valider
														// on regarde le bonus_min_odd
														if (firstSite.bonus_min_odd < secondSite.bonus_min_odd){
															chooseSite = 0;
														} else if (firstSite.bonus_min_odd > secondSite.bonus_min_odd){
															chooseSite = 1;
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

												console.log('[Bet #%s] ###### STARTING ONLY 1 SITE (not enough bankroll to start 2)',betNumber);


											} else {
												// cas de zéro site ongoing: on doit absolument démarrer deux sites
												// cas de au moins un site ongoing : la somme des bonus des deux sites est égale ou inférieure à la bankroll
												// on peut donc effectivement commencer les deux sites.
												//console.log('Nb sites found',sites.length);
												console.log('[Bet #%s] ###### STARTING 2 NEW SITES',betNumber);
												

												// On assigne au hasard une partie de la bankroll selon le bonus_limit
												// (On verra ensuite pour leur assigner un dépôt FIXE depuis la BD)
												var chosenSiteNb = Math.floor(Math.random() * 2);
												var otherSiteNb = (chosenSiteNb === 1) ? 0 : 1;

											}

											// on s'occupe des dépots pour each site.
											
											async.each(
												[chosenSiteNb,otherSiteNb],
												function updateSite(siteNb,callback){
													if (siteNb > -1){

														var site = notyetsites[siteNb];
														var deposit = Math.round(Math.min(bankroll,site.bonus_limit));
														var newSolde = deposit + site.solde;										
														bankroll = bankroll - deposit;
														console.log('[Bet #%s] Site %s - Dépôt %s - Remaining Bankroll %s',betNumber,site.name,newSolde,bankroll);
														logs.push({type:'depot',msg:`${site.name} - Dépôt ${deposit} - Remaining Bankroll ${bankroll.toFixed(2)}`});

														OngoingSites.update({iterNb:iterNb,name:site.name},{deposit:deposit,solde:newSolde,site_status:'ongoing'},function(err,result){
															//console.log('Updating site %s - err:%s - result %s',site.name,err,result);
															console.log('[Bet #%s] callback updateSite for site %s',betNumber,site.name);
															callback(null,null);
														});
													} else {
														callback(null,null)
													}
												},
												function (err){
													console.log('callback decideSites');
													callbackDecideSites();
												}
											);

										}
										

									});
							
								} else if ( ongoingsites.length === 2 ){
									// Y a déjà deux sites mais si la bankroll est suffisamment grande pour commencer le site suivant, on le commence

									// pour l'instant, on prend le premier site 'not yet' de la liste de Pierre
									OngoingSites.find({iterNb:iterNb,site_status:'not yet'},{},{sort:{order_pierre:1},limit:1},function(err,notyetsites){

										if (!notyetsites || notyetsites.length === 0){
											// no more 'not yet' sites either, it means we are done with all the sites
											console.log('[Bet #%s] NO MORE SITES, WE STOP',betNumber);
											logs.push({type:'site',msg:'Plus de site disponible, simulation terminée'});
											noMoreAvailableSites = true;
											callbackDoWhilst();

										} else {

											// on regarde si le bonus du site choisi est inférieur à la bankroll
											// si c'est le cas on peut démarrer le site
											var site = notyetsites[0];											
											if (site.bonus_limit > bankroll){												
												console.log('[Bet #%s] ###### Déjà 2 sites. On ne commence pas de nouveau site, pas assez de bankroll (%s) pour le bonus du site suivant (%s,%s) dans la liste',betNumber,bankroll,site.name,site.bonus_limit);
												logs.push({type:'site',msg:`Déjà 2 sites et pas assez de bankroll (${bankroll}) pour commencer le site suivant ${site.name} (bonus: ${site.bonus_limit})`});
												callbackDecideSites();
											} else {												
												console.log('[Bet #%s] ###### Assez de bankroll pour commencer un nouveau site',betNumber);
												
												var deposit = Math.round(Math.min(bankroll,site.bonus_limit));
												var newSolde = deposit + site.solde;										
												bankroll = bankroll - deposit;
												console.log('[Bet #%s] Site %s - Dépôt %s - Remaining Bankroll %s',betNumber,site.name,newSolde,bankroll);
												logs.push({type:'depot',msg:`${site.name} - Dépôt ${deposit} - Remaining Bankroll ${bankroll.toFixed(2)}`});

												OngoingSites.update({iterNb:iterNb,name:site.name},{deposit:deposit,solde:newSolde,site_status:'ongoing'},function(err,result){
													//console.log('Updating site %s - err:%s - result %s',site.name,err,result);
													console.log('[Bet #%s] callback decideSites pour site %s',betNumber,site.name);
													callbackDecideSites();
												});
											}

										}
									});

								} else {
									// NOTHING TO DO
									// ON PASSE A LA SUITE, ET ON PARIE
									console.log('[Bet #%s] ###### déjà 3 sites, on ouvre rien de plus pour linstant',betNumber);
									console.log('callback decideSites');
									callbackDecideSites();

								}
							},

							function decideGameAndBets(callbackDecideBets){
								// on recupere à nouveau les sites
								OngoingSites.find({iterNb:iterNb,site_status:'ongoing'},function(err,sites){

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
									
									decideBets(chosenSite,otherSites,chosenGame,chosenOddType,logs,
										logBonusType, gameLogObject,betNumber)

									var allSites = [];
									allSites.push(chosenSite);
									otherSites.forEach(function(otherSite){
										allSites.push(otherSite);
									});
									
									// updating the sites in DB
									async.each(
										allSites,
										function updateSite(site,callback){
											OngoingSites.update({iterNb:iterNb,name:site.name},
												{
													solde:site.solde,
													bonus_solde:site.bonus_solde
												},
												function updateSiteAfterDecide(err,result){															
													console.log('OngoingSites - updateSiteAfterDecide - err:%s - result:%s',err,JSON.stringify(result));
													callback();											
												}
											);
										},
										function (err){
											console.log('callback decideBets');
											callbackDecideBets(null,gameLogObject,chosenGame,allSites);
										}
									);
										

								});

								
							}, 

							function resultGame(gameLogObject,chosenGame,allSites,callbackResultGame){

								bankroll = computeResultGame(chosenGames,chosenGame,allSites,bankroll,betNumber,logs,gameLogObject);
								
								async.each(
									allSites,
									function updateSite(site,callback){
										OngoingSites.update({iterNb:iterNb,name:site.name},
											{
												solde:site.solde,
												bonus_remaining:site.bonus_remaining,
												bonus_status:site.bonus_status,
												withdraw:site.withdraw,
												site_status:site.site_status,
												bonus_solde:site.bonus_solde},
											function(err,result){
												console.log('OngoingSites - updateAfterResult - err:%s - result:%s',err,JSON.stringify(result));
												callback();											
											}
										);

									},
									function afterUpdateSite(err){
										console.log('Les deux sites ont été mis à jour en base');

										callbackResultGame(null,chosenGame);


									}
								);

							}


						],function after(err,chosenGame){
							console.log('####### NEXT GAME and ITERATION');
							tempBegin = moment(chosenGame.date).add(2,'days');
							tempEnd = moment(tempBegin).add(2+intervalOfDays,'days');
							betNumber++;
							callbackDoWhilst();
						})
					});




					
				} else {
					tempEnd = moment(tempEnd).add(1,'days');
					callbackDoWhilst();
				}
			});
		},
		function whilefunction(){
			return (tempEnd.isSameOrBefore(loopUntil) && !noMoreAvailableSites);
			//return betNumber <=5;
		},
		function afterfunction(){
			

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
		}
	);


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
	console.log('indexlog',indexlog);
	console.log('gameLogObject',gameLogObject);
	gameLogObject[indexlog].winclass = 'win';
	logs.push({type:'pari_tableau',gameLogObject:gameLogObject});

	
	console.log("[Bet #%s] Résultat: %s - Mises victorieuses : %s",
		betNumber,printFinalResult(chosenGame,final_result),printOddTypes(chosenGame,winningOdds));
	logs.push({type:'pari_resultat',msg:`Pari ${betNumber} : Résultat: ${printFinalResult(chosenGame,final_result)}`});
	// END LOGGING

	allSites.forEach(function (site){
		site.chosenBets.forEach(function (chosenBet){
			
			if (winningOdds.includes(chosenBet.odd_type)){
				// pari gagnant
				// TODO: dans le cas d'un pari gratuit, il faut changer ça
				site.solde = site.solde + chosenBet.odd * chosenBet.sum;

				
				if (site.bonus_status === 'not yet' && site.bonus_type === 'free_win_or_lose'){
					// si c'est un site avec 'free_win_or_lose', et que le bonus n'était pas encore en usage (premier pari)
					// on met à jour le bonus à valider (bonus_remaining) avec le minimum entre le bonus_limt et la somme misée,
					// multiplié par le nombre de fois où faut le parier
					// on met à jour le solde du bonus (bonus_solde) avec le minimum entre le bonus_limt et la somme misée, 

					site.bonus_remaining = Math.min(site.bonus_limit,chosenBet.sum) * site.times;
					site.bonus_solde = Math.min(site.bonus_limit,chosenBet.sum);
					site.bonus_status = 'ongoing';
				} else if (site.bonus_status === 'not yet' && 
					( site.bonus_type === 'refund' || site.bonus_type === 'free_lose' || site.bonus_type === 'none')){	
					// si c'est un site avec 'refund', 'free_lose', 'none' et que le bonus n'était pas encore en usage (premier pari)
					// on met à jour le bonus à 'done' car on ne pourra pas l'utiliser 
																
					site.bonus_status = 'done';
				} else if (site.bonus_status === 'ongoing'){
					// Si le bonus était en usage, 
					// on met à jour le bonus_remaining avec la différence entre l'ancien bonus_remaining et ce qui a été misé
					
					site.bonus_remaining = Math.max(site.bonus_remaining - chosenBet.sum,0);					
				}
				

				console.log("[Bet #%s] Pari gagnant sur",betNumber,site.name);
				logs.push({type:'pari',msg:`Pari ${betNumber} : ${site.name} (Pari Gagnant) - Solde : ${site.solde.toFixed(2)} - Solde Bonus : ${site.bonus_solde.toFixed(2)} - Bonus restant à valider : ${site.bonus_remaining.toFixed(2)}`});


			} else {
				// pari perdant

				// si le bonus du site n'est pas encore "utilisé" et qu'il n'y a pas de bonus sur le site (PMU)
				if (site.bonus_status === 'not yet' && site.bonus_type === 'none') {
					site.bonus_status = 'done';
				}

				// si le bonus du site est pas encore utilisé, on peut l'activer.																			
				if (site.bonus_status === 'not yet'){
					if (site.bonus_type === 'free_win_or_lose' || site.bonus_type === 'refund' || site.bonus_type === 'free_lose'){
						// on initialise les bonus
						site.bonus_remaining = Math.min(site.bonus_limit,chosenBet.sum) * site.times;
						site.bonus_solde = Math.min(site.bonus_limit,chosenBet.sum);
						site.bonus_status = 'ongoing';
					} 

				// si le bonus du site est ongoing
				} else if (site.bonus_status === 'ongoing'){
					if (site.bonus_type === 'free_win_or_lose' || site.bonus_type === 'refund' || site.bonus_type === 'free_lose'){
						// on met à jour les bonus (le solde et le restant à valider)
						site.bonus_remaining = Math.max(site.bonus_remaining - chosenBet.sum,0);
						//site.bonus_solde = site.bonus_solde - chosenBet.sum;
					}

				}

				logs.push({type:'pari',msg:`Pari ${betNumber} : ${site.name} (Pari Perdant) - Solde : ${site.solde.toFixed(2)} - Solde Bonus : ${site.bonus_solde.toFixed(2)} - Bonus restant à valider : ${site.bonus_remaining.toFixed(2)}`});
			}
		});

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


		if ( (site.bonus_status === 'ongoing' && site.bonus_remaining === 0 && (site.solde > 0 || site.bonus_solde > 0))
			|| (site.bonus_status === 'done' && (site.solde > 0 || site.bonus_solde > 0))) {
			// le bonus a été terminé, on peut fermer ce site et remettre l'argent dans la bankroll
			var withdraw = site.solde + site.bonus_solde;
			bankroll += withdraw;
			site.withdraw += withdraw;
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
			bankroll += withdraw;
			site.withdraw += withdraw;
			//site.site_status = 'done';
			site.solde = 0;
			//site.bonus_solde = 0;
			//site.bonus_status = 'done';

			console.log("Site %s - Retrait de %s du solde principal, il ne reste plus que le bonus.",site.name,withdraw);
			logs.push({type:'retrait',msg:`${site.name} - Retrait ${withdraw.toFixed(2)} - On retire le solde principal, on conserve le bonus`});
		} 


		console.log("[Bet #%s] %s",betNumber,printSiteStatus(site));



	});
	
	console.log("[Bet #%s] Après le pari, la bankroll est de %s",betNumber,bankroll.toFixed(2));
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

var printFinalResult = function(game,final_result){
	switch (final_result) {
		case 'H':
			return game.home_team;
		case 'D':
			return 'Nul';
		case 'A':
			return game.away_team;
	}
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
// if mode is 'win' we want an easy game to win so we look for a game which odds is the smallest, but bigger than min_odd
// if mode is 'lose' we want a game to lose so we look for a game which odds is the closest to min_odd

var findBestGame = function(games, min_odd, mode,doubleChanceAllowed){
	//var nb = games.length;
	//var chosen = Math.floor(Math.random() * nb);

	var smallestOdd = 100;
	var indexSmallestOdd = -1;
	var typeSmallestOdd = '';
	var safeMinOdd = min_odd*1.07;

	var doubleChanceOdds = ['home_draw_odd','home_away_odd','away_draw_odd'];

	for (var i = 0; i < games.length ; i++){
		var game = games[i];
	
		/*var home_odd = game.home_odd;
		var away_odd = game.away_odd;
		var draw_odd = game.draw_odd;
		var home_draw_odd = game.home_draw_odd;
		var home_away_odd = game.home_away_odd;
		var away_draw_odd = game.away_draw_odd;

		if (home_odd < smallestOdd && home_odd > min_odd){
			smallestOdd = home_odd;
			indexSmallestOdd = i;
			typeSmallestOdd = 'home_odd';

		}*/

		for (var oddprop in game._doc){
			if (!game.hasOwnProperty(oddprop)){
				if (game[oddprop] < smallestOdd && game[oddprop] > safeMinOdd){
					if (doubleChanceAllowed || !doubleChanceOdds.includes(oddprop)){
						smallestOdd = game[oddprop];
						indexSmallestOdd = i;
						typeSmallestOdd = oddprop;					
					}					
				}
			}
		}
	}


	return {index:indexSmallestOdd,odd_type:typeSmallestOdd};
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

/* 	return the index in the list of sites
   	of the best site according to the conditions
   	if several sites, we take the one with highest bonus conditions

*/
var findSitesWithConditions = function (sites,bonus_type,bonus_status,min_bonus_min_odd,min_times){
	var bestSitesNb = [];
	//console.log('findSitesWithConditions - looking between sites',sites);
	for (var i = 0; i < sites.length; i++){
		var site = sites[i];
		if ( (!bonus_type || site.bonus_type === bonus_type)
			&& (!bonus_status || site.bonus_status === bonus_status) 
				&& site.bonus_min_odd >= min_bonus_min_odd
				&& site.times >= min_times){
			bestSitesNb.push(i);
		}
	}

	//console.log('findSitesWithConditions - site indices respecting the conditions',bestSitesNb);

	if (bestSitesNb.length === 0){
		// not found
		return -1;
	} else if (bestSitesNb.length === 1){
		// we rturn that site number
		return bestSitesNb[0];

	} else {
		// we look for the most complicated bonus 
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

var findBestSiteWithBonusTypeAndBestGame = function(sites,games,betNumber){
	var chosenSite;
	var otherSites;
	var logBonusType = '';
	var chosenGameObj;

	var bestSiteConditionsInOrder = [
		{desc:'Bonus pas encore commencé et beaucoup de conditions',goal:'win',game_odd:2,
			bonus_type:null,bonus_status:'not yet',min_bonus_min_odd:1,min_times:3},
		{desc:'Pari Gratuit si perdant ou gagnant',goal:'win',game_odd:1.5,
			bonus_type:'free_win_or_lose',bonus_status:'not yet',min_bonus_min_odd:0,min_times:0},
		{desc:'Pari Gratuit si perdant',goal:'win',game_odd:2,
			bonus_type:'free_lose',bonus_status:'not yet',min_bonus_min_odd:0,min_times:0},
		{desc:'Pari Remboursé en cours avec conditions',goal:'lose',game_odd:4,
			bonus_type:'refund',bonus_status:'not yet',min_bonus_min_odd:1,min_times:1}
	]

	// le pari double chance est autorise uniquement si c'est le premier pari
	// et si y a que deux sites
	// sinon, non (car c'est pas rentable réellement)
	var doubleChanceAllowed = (betNumber === 1 && sites.length <= 2);

	for (let condition of bestSiteConditionsInOrder){
		//console.log('Condition',condition);
		var foundIndex = findSitesWithConditions(sites,condition.bonus_type,condition.bonus_status,condition.min_bonus_min_odd,condition.min_times);
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
		
			chosenGameObj = findBestGame(games,condition.game_odd,condition.goal,doubleChanceAllowed);

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
			
		// for other cases we just decide a game with a odd close to 2, and 'win'
		// TODO: should probably be improved
		// FIND GAME
		
		chosenGameObj = findBestGame(games,2.5,'win',doubleChanceAllowed);
	}


	return {
		chosenSite : chosenSite,
		otherSites : otherSites,
		logBonusType : logBonusType,
		chosenGameObj : chosenGameObj
	};


}

var decideBets = function(chosenSite,otherSites,chosenGame,
	chosenOddType,logs,logBonusType,gameLogObject,betNumber){
	
	
	console.log('[Bet #%s] %s : %s - %s',
		betNumber,moment(chosenGame.date).format('DD MMM'),chosenGame.home_team,chosenGame.away_team);
	logs.push({type:'pari_important',msg:`Pari ${betNumber} : Match du ${moment(chosenGame.date).format('DD MMM')} entre ${chosenGame.home_team} et ${chosenGame.away_team} `});
	logs.push({type:'pari',msg:logBonusType});

	
	// ######################
	// CHOOSE BETS SUMS
	// ######################


	// ################################
	// Chosen bet for the 'chosen' site
	// ################################
	if (chosenSite.solde > 0){
		chosenSite.chosenBets = [{
			odd : chosenGame[chosenOddType],
			odd_type : chosenOddType,
			sum : chosenSite.solde,
			using_bonus_solde : false
		}]
		chosenSite.solde = 0;
	} else {
		// on utilise le solde du bonus
		chosenSite.chosenBets = [{
			odd : chosenGame[chosenOddType],
			odd_type : chosenOddType,
			sum : chosenSite.bonus_solde,
			using_bonus_solde : true
		}]
		chosenSite.bonus_solde = 0;
	}

	
	// ################################
	// Chosen bet for the other site(s)
	// ################################

	var otherSitesOddTypes = findOppositeOddTypes(chosenOddType);

	if (otherSites.length === 1){
		// un seul autre site, c'est donc un DOUBLE PARI sur un site et deux résultats
		// sauf si c'est un pari double chance
		var otherSite = otherSites[0];
		var otherSiteSum = 0;
		var otherSiteUsingBonusSolde = false;
		if (otherSite.solde > 0){
			otherSiteSum = otherSite.solde;
			otherSite.solde = 0
		} else {
			// on utilise le bonus
			otherSiteSum = otherSite.bonus_solde;
			otherSite.bonus_solde = 0;
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
		//		improvement: on devrait choisir mieux chaque pari sru chaque site
		// 		en ayant conscience des sites, des bonus restant à valider...
		// 		y a forcément des sites où on veut perdre
		//		
		
		for (var i = 0; i < otherSites.length;i++){
			var otherSite = otherSites[i];
			var otherSiteSum = 0;
			var otherSiteUsingBonusSolde = false;
			if (otherSite.solde > 0){
				otherSiteSum = otherSite.solde;
				otherSite.solde = 0;
			} else {
				// on utilise le bonus
				otherSiteSum = otherSite.bonus_solde;
				otherSite.bonus_solde = 0;
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
		site.chosenBets.forEach(function (chosenBet){
			console.log('[Bet #%s] Site %s - Pari sur %s - Cote %s - Somme %s (%s)',
				betNumber,site.name,printOddTypes(chosenGame,chosenBet.odd_type),chosenBet.odd,chosenBet.sum.toFixed(2),(chosenBet.using_bonus_solde === true)? 'Bonus':'Solde normal');
			//logs.push({type:'pari',msg:`Pari ${betNumber} : Site ${site.name} - On va parier ${chosenBet.sum} € (${(chosenBet.using_bonus_solde === true)? 'Bonus':'Solde normal'}) sur ${printOddTypes(chosenGame,chosenBet.odd_type)} à une côte de ${chosenBet.odd}`});
			var indexlog = 0;
			if (chosenBet.odd_type === 'home_odd' || chosenBet.odd_type === 'home_draw_odd'){
				indexlog = 0;
			} else if (chosenBet.odd_type === 'draw_odd' || chosenBet.odd_type === 'away_draw_odd'){
				indexlog = 1;
			} else if (chosenBet.odd_type === 'away_odd' || chosenBet.odd_type === 'home_away_odd'){
				indexlog = 2;
			} 
			if ((chosenBet.odd_type === 'home_draw_odd') || (chosenBet.odd_type === 'home_draw_odd') || (chosenBet.odd_type === 'home_draw_odd')){
				gameLogObject[3] = true;
			}

			gameLogObject[indexlog] = {
				site : site.name, 
				odd:chosenBet.odd, 
				who:printOddTypes(chosenGame,chosenBet.odd_type), 
				bet:chosenBet.sum.toFixed(2),
				using_bonus_solde_text : ((chosenBet.using_bonus_solde === true)? 'Bonus':'Solde normal'),
				winclass:''
			};
		});
	});

}


var oldFindBestSiteWithBonusTypeAndBestGame = function(sites,games,betNumber){
	var chosenSite;
	var otherSite;
	var logBonusType = '';
	var chosenGameObj;

	var siteFreeWinOrLoseFound = findBestSiteWithBonusType(sites,'free_win_or_lose');
	if (siteFreeWinOrLoseFound >= 0){
		chosenSite = sites[siteFreeWinOrLoseFound];
		otherSite = sites[siteFreeWinOrLoseFound === 0 ? 1 : 0];
		console.log('[Bet #%s] free_win_or_lose - Pari sur les deux sites suivants : %s et %s',betNumber,chosenSite.name,otherSite.name);
		logBonusType = `Pari ${betNumber} : On va parier sur ${chosenSite.name} (Pari gratuit si gagnant ou perdant) et ${otherSite.name} `;
		
		// quand c'est free_win_or_lose : on va gagner le bonus quoiqu'il arrive 
		// DONC le mieux c'est d'avoir la cote la plus basse possible sur le site free_win_or_lose
		// (pour pouvoir maximiser les autres cotes)
		// et il faut qu'elle soit au-dessus de min_odd 
		console.log('[Bet #%s] ###### CHOOSING GAME',betNumber);
		// ######## DECIDER DU MATCH ##########
		chosenGameObj = findBestGame(games,chosenSite.first_bet_min_odd,'win');
		
	} else {
		var siteRefundFound = findBestSiteWithBonusType(sites,'refund');
		if (siteRefundFound >= 0){
			chosenSite = sites[siteRefundFound];
			otherSite = sites[siteRefundFound === 0 ? 1 : 0];
			console.log('[Bet #%s] refund - Pari sur les deux sites suivants : %s et %s',betNumber,chosenSite.name,otherSite.name);
			logBonusType = `Pari ${betNumber} : On va parier sur ${chosenSite.name} (Pari remboursé) et ${otherSite.name} `;
			
			// quand c'est refund, 
			// 		- si le bonus est en 'not yet', on préfère perdre le pari sur le site 'refund' et débloquer le bonus
			//		- sinon, on préfère gagner le pari, donc cote plus proche de 2.
			// 18 mai: cette règle est fausse: là entre Netbet et France Pari on choisit Netbet et comme c'est en 'not yet' au début
			// on essaie de perdre sur Netbet. Alors qu'on veut évidemment gagner sur Netbet car on a choisi le site avec les plus grosses conditions
			// Reellement il faudrait prendre le site avec les plus faibles conditions et essayer de perdre sur celui-ci, non?
			// TODO : il faudra gérer le fait que à cause des bonus à valider sur l'autre site du pari, c'est peut-être nécessaire de voir
			// la cote minimale pour ces validations...
			// TODO 15 mai: peut-être venu le temps de faire un findBestGame(games,sites) qui prennent en compte les règles
			// les bonus, ceci cela... voire même qui fasse le "findBestSiteWithBonusType" directement

			console.log('[Bet #%s] ###### CHOOSING GAME',betNumber);
			// ######## DECIDER DU MATCH ##########
			
			if (chosenSite.bonus_status === 'not yet'){
				chosenGameObj = findBestGame(games,3.5,'lose');
			} else {
				chosenGameObj = findBestGame(games,2,'win');
			}
		} else {
			// no free_win_or_lose and no refund
			var siteFreeLoseFound = findBestSiteWithBonusType(sites,'free_lose');
			if (siteFreeLoseFound >= 0){
				chosenSite = sites[siteFreeLoseFound];
				otherSite = sites[siteFreeLoseFound === 0 ? 1 : 0];
				console.log('[Bet #%s] free_lose - Pari sur les deux sites suivants : %s et %s',betNumber,chosenSite.name,otherSite.name);
				logBonusType = `Pari ${betNumber} : On va parier sur ${chosenSite.name} (Pari gratuit si perdant) et ${otherSite.name} `;
				
				// quand c'est free_lose, on gagne le bonus que si on perd
				// donc pour l'instant on essaie de prendre un pari avec une cote assez grosse
				// TODO : il faudra gérer le fait que à cause des bonus à valider sur l'autre site du pari, c'est peut-être nécessaire de voir
				// la cote minimale pour ces validations...
				// TODO 15 mai: peut-être venu le temps de faire un findBestGame(games,sites) qui prennent en compte les règles
				// les bonus, ceci cela... voire même qui fasse le "findBestSiteWithBonusType" directement
				console.log('[Bet #%s] ###### CHOOSING GAME',betNumber);
				// ######## DECIDER DU MATCH ##########
				chosenGameObj = findBestGame(games,3.5,'lose');
			} else {
				// tous les autres cas donc on s'en fiche
				chosenSite = sites[0];
				otherSite = sites[1];
				console.log('[Bet #%s] other cases - Pari sur les deux sites suivants : %s et %s',betNumber,chosenSite.name,otherSite.name);
				logBonusType = `Pari ${betNumber} : On va parier sur ${chosenSite.name} (Ni pari gratuit ni pari remboursé) et ${otherSite.name} `;
			
				// for other cases we just decide a game with a odd close to 2, and 'win'
				// TODO: should probably be improved
				chosenGameObj = findBestGame(games,2,'win');

			}
		}
	}

	return {
		chosenSite : chosenSite,
		otherSite : otherSite,
		logBonusType : logBonusType,
		chosenGameObj : chosenGameObj
	};


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

app.get('/games', function (req, res) {
  
  
  Games.Games.find({},{},{sort:{date:1}},function(err,result){
  	console.log('games found',JSON.stringify(result));
  	//res.send(result);
  	res.render('games',{games:result});
  });

  

});

app.get('/bettingsites', function (req, res) {
  
  
  OngoingSites.find({},{},{sort:{order_pierre:1}},function(err,result){
  	console.log('ongoingsites found',JSON.stringify(result));
  	res.render('bettingsites',{sites:result});
  });

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