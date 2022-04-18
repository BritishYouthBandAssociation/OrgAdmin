'use strict';

/* global __lib */

// Import modules
const express = require('express');
const router = express.Router();
const {
	repositories: {
		OrganisationRepository,
		UserRepository,
		MembershipRepository
	}
} = require(__lib);

router.get('/', async (req, res) => {
	const membership = await MembershipRepository.getAllForSeason(req.db, 2022);
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

router.get('/:id', async (req, res, next) => {
	const membership = await MembershipRepository.getByID(req.db, req.params.id);
	if(membership == null){
		return next();
	}

	let entity = null;
	if(membership.isOrganisation){
		entity = await OrganisationRepository.getByID(req.db, membership.entityID);
	} else {
		entity = await UserRepository.getByID(req.db, membership.entityID);
	}

	return res.render("membership/view.hbs", {
		title: `Membership ${membership.number}`,
		membership: membership,
		entity: entity
	});
});

module.exports = {
	root: '/membership/',
	router: router
};