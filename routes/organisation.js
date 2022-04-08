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
		types: types,
		saved: req.query.saved ?? false
	});
});

router.post('/:orgID', async (req, res, next) => {
	const org = await lib.repositories.OrganisationRepository.getOrganisationByID(req.db, req.params.orgID);
	if(org == null){
		return next();
	}

	org.name = req.body.name;
	org.slug = req.body.slug;
	org.description = req.body.description;
	org.typeID = req.body.type;

	await lib.repositories.OrganisationRepository.update(req.db, org);

	return res.redirect(org.id + "?saved=1");
});

module.exports = {
	root: '/organisation/',
	router: router
};