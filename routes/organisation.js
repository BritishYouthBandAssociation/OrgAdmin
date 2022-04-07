'use strict';

/* global __lib */

// Import modules
const express = require('express');
const router = express.Router();
const lib = require(__lib);

router.get('/', async (req, res) => {
	const orgs = await lib.repositories.OrganisationRepository.getAll(req.db);
	console.log(orgs);
	return res.render('organisation/index.hbs', {
		title: 'Organisations',
		organisations: orgs
	});
});

module.exports = {
	root: '/organisation/',
	router: router
};