function showHideGames(iterNb,betNb){

	var classGames = 'div.games_'+iterNb+'_'+betNb;
	console.log('classGames',classGames);

	if ($(classGames).is(':visible')){
		$(classGames).hide();
	} else {
		$(classGames).show();
	}
}
