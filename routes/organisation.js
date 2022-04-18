'use strict';

/* global __lib */

// Import modules
const express = require('express');
const router = express.Router();
const {
	repositories: {
		AddressRepository,
		OrganisationRepository,
		OrganisationTypeRepository
	}
} = require(__lib);

router.get('/', async (req, res) => {
	const orgs = await OrganisationRepository.getAll(req.db);

	return res.render('organisation/index.hbs', {
		title: 'Organisations',
		organisations: orgs
	});
});

router.get('/new', async (req, res) => {
	const types = await OrganisationTypeRepository.getAll(req.db);

	return res.render('organisation/add.hbs', {
		title: "Add New Organisation",
		types: types,
		organisation: {}
	});
});

router.post('/new', async (req, res) => {
	const addressID = await AddressRepository.add(req.db, req.body.lineOne, req.body.lineTwo, req.body.city, req.body.postcode);
	const orgID = await OrganisationRepository.add(req.db, req.body.name, req.body.slug, req.body.description, addressID, req.body.type);

	res.redirect(orgID);
});

router.get('/:orgID', async (req, res, next) => {
	const org = await OrganisationRepository.getByID(req.db, req.params.orgID);
	if(org == null){
		return next();
	}

	const address = await AddressRepository.getByID(req.db, org.addressID);
	const types = await OrganisationTypeRepository.getAll(req.db);

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
	const org = await OrganisationRepository.getByID(req.db, req.params.orgID);
	if(org == null){
		return next();
	}

	org.name = req.body.name;
	org.slug = req.body.slug;
	org.description = req.body.description;
	org.typeID = req.body.type;

	await OrganisationRepository.update(req.db, org);

	return res.redirect(org.id + "?saved=1");
});

module.exports = {
	root: '/organisation/',
	router: router
};