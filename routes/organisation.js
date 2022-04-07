'use strict';

/* global __lib */

// Import modules
const express = require('express');
const router = express.Router();
const lib = require(__lib);

router.get('/', async (req, res) => {
	const orgs = await lib.repositories.OrganisationRepository.getAll(req.db);

	return res.render('organisation/index.hbs', {
		title: 'Organisations',
		organisations: orgs
	});
});

router.get('/:orgID', async (req, res, next) => {
	const org = await lib.repositories.OrganisationRepository.getOrganisationByID(req.db, req.params.orgID);
	if(org == null){
		return next();
	}

	const address = await lib.repositories.AddressRepository.getByID(req.db, org.addressID);
	const types = await lib.repositories.OrganisationTypeRepository.getAll(req.db);

	return res.render('organisation/view.hbs', {
		title: org.name,
		organisation: org,
		contacts: [],
		address: address,
		types: types
	});
});

module.exports = {
	root: '/organisation/',
	router: router
};