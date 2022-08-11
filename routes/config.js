'use strict';

const express = require('express');
const router = express.Router();

const checkAdmin = (req, res, next) => {
	if (!req.session.user.IsAdmin){
		return res.redirect("/no-access");
	}

	next();
};

router.get('/', checkAdmin, (req, res) => {
	const sections = ['Membership Type', 'Organisation Type', 'Event Type', 'Payment Type'];

	return res.render('config/index.hbs', {
		title: 'Configuration',
		sections: sections
	});
});

router.get('/membership-type', checkAdmin, async (req, res) => {
	const types = await req.db.MembershipType.findAll({
		include: [{
			model: req.db.Label
		}]
	});

	return res.render('config/membership-type.hbs', {
		title: 'Membership Types',
		types: types,
		saved: req.query.saved ?? false
	});
});

router.post('/membership-type', checkAdmin, async (req, res) => {
	for (let i = 0; i < req.body.type.length; i++){
		let labelID = req.body.lbl[i];

		if (labelID < 0){
			//insert
			const lbl = await req.db.Label.create({
				Name: req.body.type[i],
				BackgroundColour: req.body.bg[i],
				ForegroundColour: req.body.fg[i]
			});

			labelID = lbl.id;
		} else {
			//update
			await req.db.Label.update({
				Name: req.body.type[i],
				BackgroundColour: req.body.bg[i],
				ForegroundColour: req.body.fg[i]
			}, {
				where: {
					id: labelID
				}
			});
		}

		if (req.body.id[i] < 0){
			//insert
			await req.db.MembershipType.create({
				Name: req.body.type[i],
				IsActive: req.body.isActive[i],
				IsOrganisation: req.body.isOrganisation[i],
				Cost: req.body.cost[i],
				LabelId: labelID
			});
		} else {
			//update
			await req.db.MembershipType.update({
				Name: req.body.type[i],
				IsActive: req.body.isActive[i],
				IsOrganisation: req.body.isOrganisation[i],
				Cost: req.body.cost[i],
				LabelId: labelID
			}, {
				where: {
					id: req.body.id[i]
				}
			});
		}
	}

	return res.redirect("?saved=1");
});

router.get('/organisation-type', checkAdmin, async (req, res) => {
	const types = await req.db.OrganisationType.findAll();

	return res.render('config/organisation-type.hbs', {
		title: 'Organisation Types',
		types: types,
		saved: req.query.saved ?? false
	});
});

router.post('/organisation-type', checkAdmin, async (req, res) => {
	for (let i = 0; i < req.body.type.length; i++){
		if (req.body.id[i] < 0){
			//insert
			await req.db.OrganisationType.create({
				Name: req.body.type[i],
				IsActive: req.body.isActive[i]
			});
		} else {
			//update
			await req.db.OrganisationType.update({
				Name: req.body.type[i],
				IsActive: req.body.isActive[i]
			}, {
				where: {
					id: req.body.id[i]
				}
			});
		}
	}

	return res.redirect("?saved=1");
});

router.get('/event-type', checkAdmin, async (req, res) => {
	const types = await req.db.EventType.findAll();

	return res.render('config/event-type.hbs', {
		title: 'Event Types',
		types: types,
		saved: req.query.saved ?? false
	});
});

router.post('/event-type', checkAdmin, async (req, res) => {
	await Promise.all(req.body.type.map((type, i) => {
		if (req.body.id[i] < 0) {
			return req.db.EventType.create({
				Name: req.body.type[i],
				IsActive: req.body.isActive[i]
			});
		}

		return req.db.EventType.update({
			Name: req.body.type[i],
			IsActive: req.body.isActive[i]
		}, {
			where: {
				id: req.body.id[i]
			}
		});
	}));

	return res.redirect("?saved=1");
});

router.get('/payment-type', checkAdmin, async (req, res) => {
	const types = await req.db.PaymentType.findAll();

	return res.render('config/payment-type.hbs', {
		title: 'Payment Types',
		types: types,
		saved: req.query.saved ?? false
	});
});

router.post('/payment-type', checkAdmin, async (req, res) => {
	await Promise.all(req.body.type.map((type, i) => {
		if (req.body.id[i] < 0) {
			return req.db.PaymentType.create({
				Description: req.body.type[i],
				IsActive: req.body.isActive[i]
			});
		}

		return req.db.PaymentType.update({
			Description: req.body.type[i],
			IsActive: req.body.isActive[i]
		}, {
			where: {
				id: req.body.id[i]
			}
		});
	}));

	return res.redirect("?saved=1");
});

router.get('/division', checkAdmin, async (req, res) => {
	const divisions = await req.db.Division.findAll();

	return res.render('config/division.hbs', {
		title: 'Divisions',
		divisions: divisions
	});
});

module.exports = {
	root: '/config/',
	router: router
};
