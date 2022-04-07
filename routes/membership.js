'use strict';

/* global __lib */

// Import modules
const express = require('express');
const router = express.Router();
const lib = require(__lib);

router.get('/', async (req, res) => {
	const membership = await lib.repositories.MembershipRepository.getMembershipForSeason(req.db, 2022);
	const labels = [];

	membership.forEach(m => {
		m.labels.forEach(l => {
			if(!labels.some(i => i.id === l.id)){
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
	});
});

module.exports = {
	root: '/membership/',
	router: router
};