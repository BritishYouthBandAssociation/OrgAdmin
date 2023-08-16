'use strict';

const express = require('express');
const Joi = require('joi');

const validator = require('@byba/express-validator');

const router = express.Router();

router.get('/organisation', validator.query(Joi.object({
	type: Joi.number()
})), async (req, res, next) => {
	const where = {};
	const include = new Set();

	include.add({
		model: req.db.OrganisationUser,
		include: [{
			model: req.db.User,
			attributes: ['FirstName', 'Surname', 'Email']
		}]
	});

	if (req.query.type) {
		where.OrganisationTypeID = req.query.type;
		include.add(req.db.OrganisationType);
	}

	const orgs = await req.db.Organisation.findAll({
		include: include.size > 0 ? Array.from(include) : null,
		where: where
	});

	res.json(orgs);
});

router.get('/organisation/search', validator.query(Joi.object({
	q: Joi.string()
		.required()
})), async (req, res) => {
	const orgs = await req.db.Organisation.search(req.query.q);
	res.json(orgs);
});

router.get('/membership/:season', validator.query(Joi.object({
	type: Joi.number()
})), validator.params(Joi.object({
	season: Joi.number()
		.required()
})), async (req, res, next) => {
	const where = {
		SeasonId: req.params.season
	};

	if (req.query.type) {
		where.MembershipTypeId = req.query.type;
	}

	const members = await req.db.Membership.getAll(where);

	res.json(members);
});

router.post('/membership/:id/labels/add', validator.params(Joi.object({
	id: Joi.number().required()
})), validator.body(Joi.object({
	labelID: Joi.number().required()
})), async (req, res, next) => {
	const [membership, label] = await Promise.all([
		req.db.Membership.findByPk(req.params.id),
		req.db.Label.findByPk(req.body.labelID)
	]);

	if (!membership || !label){
		return next();
	}

	await membership.addLabel(label);

	res.json({
		success: true
	});
});

router.delete('/membership/:id/labels/:label', validator.params(Joi.object({
	id: Joi.number().required(),
	label: Joi.number().required()
})), async (req, res, next) => {
	const [membership, label] = await Promise.all([
		req.db.Membership.findByPk(req.params.id),
		req.db.Label.findByPk(req.params.label)
	]);

	if (!membership || !label){
		console.log(membership);
		console.log(label);
		return next();
	}

	await membership.removeLabel(label);

	res.json({
		success: true
	});
});

router.get('/caption/:id/judges/search', validator.query(Joi.object({
	q: Joi.string()
		.required()
})), validator.params(Joi.object({
	id: Joi.number()
		.required()
})), async (req, res, next) => {
	const caption = await req.db.Caption.findByPk(req.params.id);

	if (!caption) {
		return next();
	}

	const judges = await req.db.User.searchByName(req.query.q, [{
		model: req.db.Caption,
		where: {
			id: caption.id
		}
	}]);

	res.json(judges);
});

router.get('/event/:id', validator.params(Joi.object({
	id: Joi.string().guid().required()
})), async (req, res, next) => {
	const [event, registration] = await Promise.all([req.db.Event.findByPk(req.params.id),
		req.db.EventRegistration.findAll({
			include: [
				req.db.Organisation,
				req.db.User,
				req.db.Division,
				req.db.Fee
			],
			where: {
				EventId: req.params.id
			}
		})]);

	if (!event) {
		return next();
	}

	res.json({
		event,
		registration
	});
});

router.get('/labels', async (req, res) => {
	const labels = await req.db.Label.findAll();

	res.json(labels);
});

router.post('/labels/new', validator.body(Joi.object({
	name: Joi.string().required()
})), async (req, res) => {
	const match = await req.db.Label.findOne({
		where: req.db.sequelize.where(req.db.sequelize.fn('lower', req.db.sequelize.col('Name')), req.body.name.toLowerCase())
	});

	if (match){
		return res.json({
			success: false,
			error: 'Label already exists'
		});
	}

	const label = await req.db.Label.createFromName(req.body.name);
	res.json({
		success: true,
		label
	});
});

router.post('/users/set-user', async (req, res) => {
	let match = await req.db.User.findOne({
		where: {
			PayloadId: req.body.payload.user.id
		}
	});

	if (!match){
		match = await req.db.User.findByEmail(req.body.email);
		if (!await match?.validPassword(req.body.password)){
			return res.status(401).json({error: 'Could not map payload user to local user'});
		}

		match.PayloadId = req.body.payload.user.id;
		await match.save();
	}

	req.session.user = match;
	req.session.save(() => res.sendStatus(200));
});

module.exports = {
	root: '/_api/',
	router: router
};
