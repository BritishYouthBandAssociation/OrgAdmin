'use strict';

/* global __lib */

// Import modules
const express = require('express');
const router = express.Router();
const lib = require(__lib);

router.get('/', async (req, res) => {
	const membership = await lib.repositories.BandRepository.getBandsInMembershipForSeason(req.db, 2022);
	const labels = [];

	membership.forEach(m => {
		m.labels.forEach(l => {
			if(!labels.some(i => i.id == l.id)){
				labels.push(l);
			}
		});
	});

	return res.render('membership/index.hbs', {
		title: "Membership",
		seasons: [2022],
		season: 2022,
		membership: membership,
		filters: labels
		/*filters: [{
			id: 1,
			name: 'Band',
			background: '#FF0',
			foreground: '#000'
		}, {
			id: 2,
			name: 'Individual',
			background: '#00F',
			foreground: '#FFF'
		}, {
			id: 3,
			name: 'Northern',
			background: '#0F0',
			foreground: '#FFF'
		}, {
			id: 4,
			name: 'Midlands',
			background: '#F00',
			foreground: '#FFF'
		}]*/
	});
});

router.get('/band/:slug', async (req, res) => {
	const band = await lib.repositories.BandRepository.getBandBySlug(req.db, req.params.slug);
	
	if(band === null){
		return res.redirect('./');
	}
	
	return res.render('membership/band', {
		title: band.name,
		name: band.name
	});
});

module.exports = {
	root: '/membership/',
	router: router
};