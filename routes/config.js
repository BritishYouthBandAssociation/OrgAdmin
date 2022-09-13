'use strict';

const {
	helpers: {
		Guard
	}
} = require(global.__lib);

const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();

const checkAdmin = (req, res, next) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	next();
};

router.get('/', checkAdmin, (req, res) => {
	const sections = ['Membership Type', 'Organisation Type', 'Event Type', 'Payment Type', 'Division', 'Caption', 'Season'];

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
	for (let i = 0; i < req.body.type.length; i++) {
		let labelID = req.body.lbl[i];

		let details = {
			Name: req.body.type[i],
			BackgroundColour: req.body.bg[i],
			ForegroundColour: req.body.fg[i]
		};

		if (labelID < 0) {
			//insert
			const lbl = await req.db.Label.create(details);
			labelID = lbl.id;
		} else {
			//update
			await req.db.Label.update(details, {
				where: {
					id: labelID
				}
			});
		}

		details = {
			Name: req.body.type[i],
			IsActive: req.body.isActive[i],
			IsOrganisation: req.body.isOrganisation[i],
			Cost: req.body.cost[i],
			LabelId: labelID
		};

		if (req.body.id[i] < 0) {
			await req.db.MembershipType.create(details);
		} else {
			//update
			await req.db.MembershipType.update(details, {
				where: {
					id: req.body.id[i]
				}
			});
		}
	}

	return res.redirect('?saved=1');
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
	await Promise.all(req.body.type.map((t, i) => {
		const details = {
			Name: req.body.type[i],
			IsActive: req.body.isActive[i]
		};

		if (req.body.id[i] < 0) {
			return req.db.OrganisationType.create(details);
		}

		return req.db.OrganisationType.update(details, {
			where: {
				id: req.body.id[i]
			}
		});
	}));

	return res.redirect('?saved=1');
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
		const details = {
			Name: req.body.type[i],
			IsActive: req.body.isActive[i]
		};

		if (req.body.id[i] < 0) {
			return req.db.EventType.create(details);
		}

		return req.db.EventType.update(details, {
			where: {
				id: req.body.id[i]
			}
		});
	}));

	return res.redirect('?saved=1');
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
		const details = {
			Description: req.body.type[i],
			IsActive: req.body.isActive[i]
		};

		if (req.body.id[i] < 0) {
			return req.db.PaymentType.create(details);
		}

		return req.db.PaymentType.update(details, {
			where: {
				id: req.body.id[i]
			}
		});
	}));

	return res.redirect('?saved=1');
});

router.get('/division', checkAdmin, async (req, res) => {
	const divisions = await req.db.Division.findAll();

	return res.render('config/division.hbs', {
		title: 'Divisions',
		divisions: divisions,
		saved: req.query.saved ?? false
	});
});

router.post('/division', checkAdmin, async (req, res) => {
	await Promise.all(req.body.division.map((d, i) => {
		const details = {
			Name: req.body.division[i],
			IsActive: req.body.isActive[i],
			PromotionDivisionID: req.body.promotion[i] === 'null' ? null : req.body.promotion[i],
			RelegationDivisionID: req.body.relegation[i] === 'null' ? null : req.body.relegation[i]
		};

		if (req.body.id[i] < 0) {
			return req.db.Division.create(details);
		}

		return req.db.Division.update(details, {
			where: {
				id: req.body.id[i]
			}
		});
	}));

	return res.redirect('?saved=true');
});

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

router.get('/caption', checkAdmin, async (req, res) => {
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

	return res.render('config/caption.hbs', {
		title: 'Captions',
		captions: captions,
		success: req.query.success ?? false
	});
});

async function saveCaption(db, caption, parent) {
	const details = {
		Name: caption.Name,
		MaxScore: caption.MaxScore,
		Multiplier: caption.Multiplier,
		IsOptional: caption.IsOptional,
		ParentID: parent
	};

	if (caption.id < 0){
		const _new = await db.create(details);

		caption.id = _new.id;
	} else {
		await db.update(details, {
			where: {
				id: caption.id
			}
		});
	}

	if (caption.Subcaptions.length > 0) {
		await Promise.all(caption.Subcaptions.map(c => {
			return saveCaption(db, c, caption.id);
		}));
	}
}

router.post('/caption', checkAdmin, async (req, res) => {
	const data = JSON.parse(req.body.caption);

	await Promise.all(data.map(c => {
		return saveCaption(req.db.Caption, c, null);
	}));

	return res.redirect('?success=1');
});

router.get('/season', checkAdmin, async (req, res) => {
	const season = await req.db.Season.findOne({
		where: {
			Start: {
				[Op.lte]: Date.now()
			},
			End: {
				[Op.gte]: Date.now()
			}
		}
	});

	const others = await req.db.Season.findAll({
		where: {
			id: {
				[Op.not]: season?.id
			}
		}
	});

	return res.render('config/season.hbs', {
		title: 'Seasons',
		season: season,
		others: others,
		saved: req.query.saved ?? false
	});
});

router.post('/season', checkAdmin, async (req, res) => {
	await req.db.sequelize.transaction(async (t) => {
		for (let i = 0; i < req.body.id.length; i++) {
			const id = Guard.againstNaN(req.body.id[i]);
			const season = {
				Identifier: Guard.againstEmptyString(req.body.name[i]),
				Start: Guard.againstInvalidDate(req.body.start[i]),
				End: Guard.againstInvalidDate(req.body.end[i])
			};

			if (id < 0) {
				await req.db.Season.create(season, {
					transaction: t
				});
			} else {
				await req.db.Season.update(season, {
					where: {
						id: id
					}
				}, { transaction: t });
			}
		}
	});

	res.redirect('?saved=true');
});

router.post('/season/:id', checkAdmin, async (req, res, next) => {
	const season = await req.db.Season.findByPk(req.params.id);

	if (!season){
		return next();
	}

	const data = {
		Identifier: Guard.againstEmptyString(req.body.name),
		Start: Guard.againstInvalidDate(req.body.start),
		End: Guard.againstInvalidDate(req.body.end)
	};

	await season.update(data);

	res.redirect('./?saved=true');
});

module.exports = {
	root: '/config/',
	router: router
};
