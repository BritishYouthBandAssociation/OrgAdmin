'use strict';

const express = require('express');
const router = express.Router();

const {
	Op
} = require('sequelize');

router.get('/', async (req, res) => {
	if (!req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	const users = await req.db.User.findAll();
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

router.get('/new', (req, res) => {
	if (!req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

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

router.post('/new', async (req, res) => {
	if (!req.session.user.IsAdmin){
		return res.redirect('/no-access');
	}

	req.body.isActive = parseInt(req.body.isActive);
	req.body.isAdmin = parseInt(req.body.isAdmin);

	const match = await req.db.User.count({
		where: {
			email: req.body.email
		}
	});

	let err = '';
	if (match > 0){
		err = 'A user with that email address already exists';
	}

	if (req.body.password !== req.body.confirm){
		err = 'Passwords do not match';
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

	if (req.query.orgID != null){
		return res.redirect(`/organisation/${req.query.orgID}/contacts/add/${req.body.email}`);
	}

	if (req.query.membership != null){
		return res.redirect(`/membership/new?email=${req.body.email}&type=${req.query.membership}`);
	}

	return res.redirect(user.id);
});

router.post('/:id/password', async (req, res, next) => {
	if (!req.session.user.IsAdmin && req.session.user.id !== req.params.id){
		return res.redirect('/no-access');
	}

	const user = await req.db.User.findByPk(req.params.id);

	if (user == null){
		return next();
	}

	if (req.body.password !== req.body.confirm){
		return res.redirect(`../${req.params.id}?nomatch=1`);
	}

	await req.db.User.update({
		Password: req.body.password
	}, {
		where: { id: req.params.id },
		individualHooks: true
	});

	return res.redirect(`../${req.params.id}?saved=1`);
});

router.get('/:id', async (req, res, next) => {
	if (!req.session.user.IsAdmin && req.session.user.id !== req.params.id){
		return res.redirect('/no-access');
	}

	const user = await req.db.User.findByPk(req.params.id, {
		include: [req.db.Caption]
	});

	if (user == null){
		return next();
	}

	return res.render('user/view.hbs', {
		title: `${user.FirstName} ${user.Surname}`,
		user: user.dataValues,
		saved: req.query.saved ?? false,
		nomatch: req.query.nomatch ?? false
	});
});

router.post('/:id', async (req, res, next) => {
	if (!req.session.user.IsAdmin && req.session.user.id != req.params.id){
		return res.redirect('/no-access');
	}

	const user = await req.db.User.findByPk(req.params.id);

	if (user == null){
		return next();
	}

	await req.db.User.update({
		Email: req.body.email,
		Password: req.body.password,
		FirstName: req.body.firstName,
		Surname: req.body.surname,
		IsActive: req.body.isActive,
		IsAdmin: req.body.isAdmin
	}, {
		where: { id: req.params.id }
	});

	return res.redirect(`${req.params.id}?saved=1`);
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

router.get('/:id/captions', async (req, res, next) => {
	if (!req.session.user.IsAdmin && req.session.user.id != req.params.id){
		return res.redirect('/no-access');
	}

	const user = await req.db.User.findByPk(req.params.id, {
		include: [req.db.Caption]
	});

	if (user == null){
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

router.post('/:id/captions', async (req, res, next) => {
	if (!req.session.user.IsAdmin && req.session.user.id != req.params.id){
		return res.redirect('/no-access');
	}

	const user = await req.db.User.findByPk(req.params.id);

	if (user == null){
		return next();
	}

	const data = await req.db.Caption.findAll({
		where: {
			id: {
				[Op.in]: req.body.caption
			}
		}
	});

	await user.setCaptions(data);

	res.redirect('?saved=1');
});

module.exports = {
	root: '/user/',
	router: router
};
