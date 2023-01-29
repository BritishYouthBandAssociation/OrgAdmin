'use strict';

const express = require('express');
const Joi = require('joi');
const router = express.Router();

const validator = require('@byba/express-validator');

const {
	Op
} = require('sequelize');

const idParamSchema = Joi.object({
	id: Joi.string()
		.guid()
		.required()
});

const {checkAdmin, matchingID} = require('../middleware');

router.get('/', checkAdmin, async (req, res, next) => {
	const users = await req.db.User.findAll({
		order: [
			['FirstName'],
			['Surname']
		]
	});
	const active = [];
	const inactive = [];

	users.forEach(u => {
		if (u.IsActive){
			active.push(u);
		} else {
			inactive.push(u);
		}
	});


	return res.render('user/index.hbs', {
		title: 'Users',
		active: active,
		inactive: inactive,
		total: users.length
	});
});

router.get('/new', checkAdmin, validator.query(Joi.object({
	orgID: Joi.number(),
	email: Joi.string().email(),
	membership: Joi.number().optional().allow('', null)
})), (req, res) => {
	const details = {
		Email: req.query.email ?? '',
		IsActive: true
	};


	return res.render('user/add.hbs', {
		title: 'Add New User',
		details: details,
		orgID: req.query.orgID ?? null
	});
});

router.post('/new', checkAdmin, validator.body(Joi.object({
	firstName: Joi.string()
		.required(),
	surname: Joi.string()
		.required(),
	email: Joi.string()
		.email()
		.required(),
	password: Joi.string()
		.required(),
	confirm: Joi.ref('password'),
	isActive: Joi.boolean()
		.truthy('1')
		.falsy('0')
		.required(),
	isAdmin: Joi.boolean()
		.truthy('1')
		.falsy('0')
		.required(),
}).with('password', 'confirm')), validator.query(Joi.object({
	orgID: Joi.number(),
	membership: Joi.number(),
	email: Joi.string()
		.email()
})), async (req, res, next) => {
	const match = await req.db.User.count({
		where: {
			email: req.body.email
		}
	});

	let err = '';

	if (match > 0){
		err = 'A user with that email address already exists';
	}

	if (err !== ''){
		return res.render('user/add.hbs', {
			title: 'Add New User',
			error: err,
			details: req.body
		});
	}

	const user = await req.db.User.create({
		Email: req.body.email,
		Password: req.body.password,
		FirstName: req.body.firstName,
		Surname: req.body.surname,
		IsActive: req.body.isActive,
		IsAdmin: req.body.isAdmin
	});

	// redirect to other creation pages that depend on users
	if (req.query.orgID){
		return res.redirect(`/organisation/${req.query.orgID}/contacts/add/${req.body.email}`);
	}

	if (req.query.membership){
		return res.redirect(`/membership/new/?email=${req.body.email}&type=${req.query.membership}`);
	}

	return res.redirect(user.id);
});

router.post('/:id/password', validator.params(idParamSchema), matchingID('id', ['user', 'id']), validator.body(Joi.object({
	password: Joi.string()
		.required(),
	confirm: Joi.ref('password')
}).with('password', 'confirm')), async (req, res, next) => {
	const user = await req.db.User.findByPk(req.params.id);

	if (!user){
		return next();
	}

	await user.update({
		Password: req.body.password,
		ForcePasswordReset: req.session.user.id !== user.id
	});

	return res.redirect('./?saved=true');
});

router.get('/:id', validator.params(idParamSchema), matchingID('id', ['user', 'id']), async (req, res, next) => {
	const user = await req.db.User.findByPk(req.params.id, {
		include: [req.db.Caption]
	});

	if (!user){
		return next();
	}

	return res.render('user/view.hbs', {
		title: `${user.FirstName} ${user.Surname}`,
		user: user.dataValues,
		saved: req.query.saved ?? false,
		nomatch: req.query.nomatch ?? false,
		needsPasswordReset: req.session.user.id === req.params.id && req.session.user.ForcePasswordReset
	});
});

router.post('/:id', validator.params(idParamSchema), matchingID('id', ['user', 'id']), validator.body(Joi.object({
	firstName: Joi.string()
		.required(),
	surname: Joi.string()
		.required(),
	email: Joi.string()
		.email()
		.required(),
	isActive: Joi.boolean()
		.truthy('1')
		.falsy('0'),
	isAdmin: Joi.boolean()
		.truthy('1')
		.falsy('0'),
})), async (req, res, next) => {
	const user = await req.db.User.findByPk(req.params.id);

	if (!user){
		return next();
	}

	const details = {
		Email: req.body.email,
		FirstName: req.body.firstName,
		Surname: req.body.surname
	};

	// Only allow updating of isAdmin and isActive fields if the request
	// comes from an admin
	if (req.session.user.IsAdmin) {
		details.IsAdmin = req.body.isAdmin;
		details.IsActive = req.body.isActive;
	}

	await user.update(details);

	return res.redirect('?saved=true');
});

//this needs putting somewhere!
async function loadCaption(db, parent){
	parent.Subcaptions = await db.findAll({
		where: {
			ParentID: parent.id
		}
	});

	await Promise.all(parent.Subcaptions.map(s => {
		return loadCaption(db, s);
	}));

	return parent;
}

router.get('/:id/captions', validator.params(idParamSchema), matchingID('id', ['user', 'id']), validator.query(Joi.object({
	saved: Joi.boolean()
})), async (req, res, next) => {
	const user = await req.db.User.findByPk(req.params.id, {
		include: [req.db.Caption]
	});

	if (!user){
		return next();
	}

	//load top level
	const captions = await req.db.Caption.findAll({
		where: {
			ParentID: null
		}
	});

	//load the rest
	await Promise.all(captions.map(c => {
		return loadCaption(req.db.Caption, c);
	}));

	return res.render('user/captions.hbs', {
		title: `${user.FullName}'s Captions`,
		user: user,
		captions: captions,
		saved: req.query.saved ?? false
	});
});

router.post('/:id/captions', validator.params(idParamSchema), matchingID('id', ['user', 'id']), validator.body(Joi.object({
	caption: Joi.array()
		.items(Joi.number())
})), async (req, res, next) => {
	const user = await req.db.User.findByPk(req.params.id);

	if (!user){
		return next();
	}

	const data = await req.db.Caption.findAll({
		where: {
			id: {
				[Op.in]: req.body.caption ?? []
			}
		}
	});

	await user.setCaptions(data);

	res.redirect('?saved=true');
});

module.exports = {
	root: '/user',
	router: router
};
