'use strict';

/* global __lib */

// Import modules
const express = require('express');
const UserRepository = require('../../Library/Repositories/UserRepository');
const router = express.Router();
const {
	repositories: {
		AddressRepository,
		OrganisationRepository,
		OrganisationTypeRepository,
		OrganisationUserRepository
	}
} = require(__lib);

//list orgs
router.get('/', async (req, res) => {
	const orgs = await OrganisationRepository.getAll(req.db);

	return res.render('organisation/index.hbs', {
		title: 'Organisations',
		organisations: orgs
	});
});

//add org
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

//show org
router.get('/:orgID', async (req, res, next) => {
	const org = await OrganisationRepository.getByID(req.db, req.params.orgID);
	if (org == null) {
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
	if (org == null) {
		return next();
	}

	org.name = req.body.name;
	org.slug = req.body.slug;
	org.description = req.body.description;
	org.typeID = req.body.type;

	await OrganisationRepository.update(req.db, org);

	return res.redirect(org.id + "?saved=1");
});

//org contacts
router.get('/:orgID/contacts', async (req, res, next) => {
	const org = await OrganisationRepository.getByID(req.db, req.params.orgID);
	if (org == null) {
		return next();
	}

	const contacts = await OrganisationUserRepository.getAllForOrganisation(req.db, org.id);

	return res.render("organisation/contacts.hbs", {
		title: `${org.name} Contact Management`,
		organisation: org,
		contacts: contacts,
		added: req.query.added ?? false,
		removed: req.query.removed ?? false,
		canAdd: contacts.length < 2
	});
});

//add contact
router.get('/:orgID/contacts/add', (req, res, next) => {
	if (req.query.email == null) {
		return next();
	}

	return res.redirect(`add/${req.query.email}`);
});

router.get('/:orgID/contacts/add/:email', async (req, res, next) => {
	const org = await OrganisationRepository.getByID(req.db, req.params.orgID);
	if (org == null) {
		return next();
	}

	const contact = await UserRepository.getByEmail(req.db, req.params.email);
	if (contact == null) {
		return res.redirect(`/users/new?orgID=${req.params.orgID}&email=${req.params.email}`);
	}

	return res.render('organisation/add-contact.hbs', {
		title: `Add ${org.name} Contact`,
		organisation: org,
		contact: contact
	});
});

router.post('/:orgID/contacts/add/:email', async (req, res, next) => {
	const org = await OrganisationRepository.getByID(req.db, req.params.orgID);
	if (org == null) {
		return next();
	}

	const contact = await UserRepository.getByEmail(req.db, req.params.email);
	if (contact == null) {
		return res.redirect(`/users/new?orgID=${req.params.orgID}&email=${req.params.email}`);
	}

	await OrganisationUserRepository.add(req.db, org.id, contact.id);
	res.redirect("../../contacts?added=1");
});

//remove contact
router.get('/:orgID/contacts/:contactID/remove', async (req, res, next) => {
	const org = await OrganisationRepository.getByID(req.db, req.params.orgID);
	if (org == null) {
		return next();
	}

	const contact = await OrganisationUserRepository.getByID(req.db, req.params.contactID);
	if (contact == null || org.id !== contact.organisationID) {
		return next();
	}

	return res.render("organisation/remove-contact.hbs", {
		title: `Remove ${org.name} Contact`,
		organisation: org,
		contact: contact
	});
});

router.post('/:orgID/contacts/:contactID/remove', async (req, res, next) => {
	const org = await OrganisationRepository.getByID(req.db, req.params.orgID);
	if (org == null) {
		return next();
	}

	const contact = await OrganisationUserRepository.getByID(req.db, req.params.contactID);
	if (contact == null || org.id !== contact.organisationID) {
		return next();
	}

	await OrganisationUserRepository.remove(req.db, contact.id);

	res.redirect("../../contacts?removed=1");
});

module.exports = {
	root: '/organisation/',
	router: router
};