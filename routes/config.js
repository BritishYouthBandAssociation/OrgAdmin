'use strict';

const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');

const validator = require('@byba/express-validator');

const router = express.Router();

const {checkAdmin} = require('../middleware');

router.get('/', checkAdmin, (req, res) => {
	const sections = ['Membership Type', 'Event Type', 'Payment Type', 'Division', 'Caption', 'Season'];

	return res.render('config/index.hbs', {
		title: 'Configuration',
		sections: sections
	});
});

router.get('/membership-type', checkAdmin, validator.query(Joi.object({
	saved: Joi.boolean()
})), async (req, res, next) => {
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

router.post('/membership-type', checkAdmin, validator.body(Joi.object({
	id: Joi.array()
		.items(Joi.number()),
	lbl: Joi.array()
		.items(Joi.number()),
	type: Joi.array()
		.items(Joi.string()),
	bg: Joi.array()
		.items(Joi.string()),
	fg: Joi.array()
		.items(Joi.string()),
	cost: Joi.array()
		.items(Joi.number()),
	isActive: Joi.array()
		.items(Joi.boolean().falsy('0').truthy('1')),
	isOrganisation: Joi.array()
		.items(Joi.boolean().falsy('0').truthy('1')),
	import: Joi.array().items(Joi.number().allow(''))
})), async (req, res, next) => {
	for (let i = 0; i < req.body.type.length; i++) {
		let labelID = req.body.lbl[i];

		let details = {
			Name: req.body.type[i],
			BackgroundColour: req.body.bg[i],
			ForegroundColour: req.body.fg[i]
		};

		if (labelID < 0) {
			//insert
			const lbl = await req.db.Label.create(details, req.getDBOptions());
			labelID = lbl.id;
		} else {
			//update
			await req.db.Label.update(details, req.getDBOptions({
				where: {
					id: labelID
				}
			}));
		}

		details = {
			Name: req.body.type[i],
			IsActive: req.body.isActive[i],
			IsOrganisation: req.body.isOrganisation[i],
			Cost: req.body.cost[i],
			LabelId: labelID,
			LinkedImportId: req.body.import[i] == '' ? null : req.body.import[i]
		};

		if (req.body.id[i] < 0) {
			await req.db.MembershipType.create(details, req.getDBOptions());
		} else {
			//update
			await req.db.MembershipType.update(details, req.getDBOptions({
				where: {
					id: req.body.id[i]
				}
			}));
		}
	}

	return res.redirect('?saved=true');
});

router.get('/event-type', checkAdmin, validator.query(Joi.object({
	saved: Joi.boolean()
})), async (req, res, next) => {
	const [types, membershipTypes] = await Promise.all([req.db.EventType.findAll({
		include: [{
			model: req.db.EventTypeDiscount,
			include: [req.db.MembershipType]
		}],
		order: [
			['id'],
			[req.db.EventTypeDiscount, 'DiscountAfter']
		]
	}), req.db.MembershipType.getActive({
		IsOrganisation: true
	})]);

	return res.render('config/event-type.hbs', {
		title: 'Event Types',
		types,
		membershipTypes,
		saved: req.query.saved ?? false
	});
});

router.post('/event-type', checkAdmin,
	validator.body(Joi.object({
		id: Joi.array()
			.items(Joi.number()),
		type: Joi.array()
			.items(Joi.string()),
		cost: Joi.array()
			.items(Joi.number()),
		isActive: Joi.array()
			.items(Joi.boolean().falsy('0').truthy('1')),
		discountAfter: Joi.array().items(Joi.array().items(Joi.number())),
		multiplier: Joi.array().items(Joi.array().items(Joi.number())),
		membersOnly: Joi.array().items(Joi.array().items(Joi.boolean())),
		membershipType: Joi.array().items(Joi.array().items(Joi.array().items(Joi.number().allow(''))))
	})),
	async (req, res, next) => {
		await Promise.all(req.body.type.map((_, i) => {
			return (async function() {
				const details = {
					Name: req.body.type[i],
					EntryCost: req.body.cost[i],
					IsActive: req.body.isActive[i]
				};

				let type = null;
				if (req.body.id[i] < 0) {
					type = await req.db.EventType.create(details, req.getDBOptions());
				} else {
					await req.db.EventType.update(details, req.getDBOptions({
						where: {
							id: req.body.id[i]
						}
					}));
					type = await req.db.EventType.findByPk(req.body.id[i]);
				}

				//clear discounts and start fresh
				await req.db.EventTypeDiscount.destroy({
					where: {
						EventTypeId: type.id
					}
				});

				if (req.body.discountAfter && req.body.discountAfter.length > i) {
					await Promise.all(req.body.discountAfter[i].map((_, d) => {
						return (async function() {
							const allPos = (req.body.membershipType[i][d] ?? []).indexOf(-1);
							if (allPos > -1) {
								req.body.membershipType[i][d].splice(allPos, 1);
							}

							const discountDetails = {
								DiscountAfter: req.body.discountAfter[i][d],
								DiscountMultiplier: req.body.multiplier[i][d],
								MembersOnly: req.body.membersOnly[i][d],
								AllMembers: allPos > -1
							};

							const discount = await type.createEventTypeDiscount(discountDetails, req.getDBOptions());

							if (discount.MembersOnly) {
								await discount.addMembershipTypes(req.body.membershipType[i][d]);
							}
						})();
					}));
				}
			})();
		}));

		return res.redirect('?saved=true');
	});

router.get('/payment-type', checkAdmin, validator.query(Joi.object({
	saved: Joi.boolean()
})), async (req, res, next) => {
	const types = await req.db.PaymentType.findAll();

	return res.render('config/payment-type.hbs', {
		title: 'Payment Types',
		types: types,
		saved: req.query.saved ?? false
	});
});

router.post('/payment-type', checkAdmin, validator.body(Joi.object({
	id: Joi.array()
		.items(Joi.number()),
	type: Joi.array()
		.items(Joi.string()),
	isActive: Joi.array()
		.items(Joi.boolean().falsy('0').truthy('1')),
})), async (req, res, next) => {
	await Promise.all(req.body.type.map((type, i) => {
		const details = {
			Description: req.body.type[i],
			IsActive: req.body.isActive[i]
		};

		if (req.body.id[i] < 0) {
			return req.db.PaymentType.create(details, req.getDBOptions());
		}

		return req.db.PaymentType.update(details, req.getDBOptions({
			where: {
				id: req.body.id[i]
			}
		}));
	}));

	return res.redirect('?saved=true');
});

router.get('/division', checkAdmin, validator.query(Joi.object({
	saved: Joi.boolean()
})), async (req, res, next) => {
	const divisions = await req.db.Division.findAll();

	return res.render('config/division.hbs', {
		title: 'Divisions',
		divisions: divisions,
		saved: req.query.saved ?? false
	});
});

router.post('/division', checkAdmin, validator.body(Joi.object({
	id: Joi.array()
		.items(Joi.number()),
	division: Joi.array()
		.items(Joi.string()),
	promotion: Joi.array()
		.items(Joi.number().allow('null')),
	relegation: Joi.array()
		.items(Joi.number().allow('null')),
	isActive: Joi.array()
		.items(Joi.boolean().falsy('0').truthy('1')),
	time: Joi.array().items(Joi.number())
})), async (req, res, next) => {
	await Promise.all(req.body.division.map((d, i) => {
		const details = {
			Name: req.body.division[i],
			IsActive: req.body.isActive[i],
			PromotionDivisionID: req.body.promotion[i] === 'null' ? null : req.body.promotion[i],
			RelegationDivisionID: req.body.relegation[i] === 'null' ? null : req.body.relegation[i],
			PerformanceTime: req.body.time[i]
		};

		if (req.body.id[i] < 0) {
			return req.db.Division.create(details, req.getDBOptions());
		}

		return req.db.Division.update(details, req.getDBOptions({
			where: {
				id: req.body.id[i]
			}
		}));
	}));

	return res.redirect('?saved=true');
});

async function loadCaption(db, parent) {
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

router.get('/caption', checkAdmin, validator.query(Joi.object({
	success: Joi.boolean()
})), async (req, res) => {
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

async function saveCaption(db, caption, parent, dbOptions) {
	const details = {
		Name: caption.Name,
		MaxScore: caption.MaxScore,
		Multiplier: caption.Multiplier,
		IsOptional: caption.IsOptional,
		ParentID: parent
	};

	if (caption.id < 0) {
		const _new = await db.create(details, dbOptions);

		caption.id = _new.id;
	} else {
		const options = JSON.parse(JSON.stringify(dbOptions));
		options.where = {
			id: caption.id
		};

		await db.update(details, options);
	}

	if (caption.Subcaptions.length > 0) {
		await Promise.all(caption.Subcaptions.map(c => {
			return saveCaption(db, c, caption.id, dbOptions);
		}));
	}
}

router.post('/caption', checkAdmin, (req, res, next) => {
	req.body.caption = JSON.parse(req.body.caption);
	next();
}, validator.body(Joi.object({
	caption: Joi.array().items(Joi.object({
		id: Joi.number()
			.required(),
		Name: Joi.string()
			.required(),
		MaxScore: Joi.number()
			.required(),
		Multiplier: Joi.number()
			.required(),
		IsOptional: Joi.boolean()
			.required(),
		ParentId: Joi.number()
			.allow(null),
		Subcaptions: Joi.array()
			.items(Joi.object())
	}).unknown(true))
}).unknown(true)), async (req, res) => {
	const data = req.body.caption;

	await Promise.all(data.map(c => {
		return saveCaption(req.db.Caption, c, null, req.getDBOptions());
	}));

	return res.redirect('?success=true');
});

router.get('/season', checkAdmin, validator.query(Joi.object({
	error: Joi.boolean(),
	saved: Joi.boolean(),
	next: Joi.string(),
	needsSeason: Joi.boolean()
})), async (req, res) => {
	const season = await req.db.Season.getCurrent();

	const others = await req.db.Season.findAll({
		where: {
			id: {
				[Op.not]: season?.id ?? 0
			}
		},
		order: [
			['Start', 'DESC']
		]
	});

	return res.render('config/season.hbs', {
		title: 'Seasons',
		season: season,
		others: others,
		error: req.query.error ?? false,
		saved: req.query.saved ?? false,
		needsSeason: req.query.needsSeason ?? false,
		next: req.query.next
	});
});

router.post('/season', checkAdmin, validator.body(Joi.object({
	id: Joi.array()
		.items(Joi.number()),
	name: Joi.array()
		.items(Joi.string().max(10)),
	start: Joi.array()
		.items(Joi.date()),
	end: Joi.array()
		.items(Joi.date()),
	next: Joi.string()
})), async (req, res) => {
	try {
		await req.db.sequelize.transaction(async (t) => {
			for (let i = 0; i < req.body.id.length; i++) {
				const id = req.body.id[i];
				const season = {
					Identifier: req.body.name[i],
					Start: req.body.start[i],
					End: req.body.end[i]
				};

				if (season.End < season.Start) {
					throw new Error('Season ends before it starts');
				}

				const match = await req.db.Season.findAndCountAll({
					where: {
						id: {
							[Op.not]: id
						},
						[Op.not]: [
							{
								[Op.or]: [
									{
										Start: {
											[Op.gte]: season.End
										},
									},
									{
										End: {
											[Op.lte]: season.Start
										}
									}
								],
							},
						]
					}
				});

				if (match.count > 0) {
					throw new Error('Season crossover');
				}

				if (id < 0) {
					await req.db.Season.create(season, req.getDBOptions({
						transaction: t
					}));
				} else {
					await req.db.Season.update(season, req.getDBOptions({
						where: {
							id: id
						}
					}), { transaction: t });
				}
			}
		});

		const redir = req.body.next ?? '?saved=true';
		res.redirect(redir);
	} catch (e) {
		console.error(e);
		res.redirect('?error=true');
	}
});

router.post('/season/:id', checkAdmin, validator.body(Joi.object({
	id: Joi.number(),
	name: Joi.string(),
	start: Joi.date(),
	end: Joi.date(),
	next: Joi.string()
})), validator.params(Joi.object({
	id: Joi.number()
		.required()
})), async (req, res, next) => {
	const season = await req.db.Season.findByPk(req.params.id);

	if (!season) {
		return next();
	}

	const data = {
		Identifier: req.body.name,
		Start: req.body.start,
		End: req.body.end
	};

	const match = await req.db.Season.findAndCountAll({
		where: {
			id: {
				[Op.not]: req.params.id
			},
			[Op.not]: [
				{
					[Op.or]: [
						{
							Start: {
								[Op.gte]: season.End
							},
						},
						{
							End: {
								[Op.lte]: season.Start
							}
						}
					],
				},
			]
		}
	});

	if (match.count > 0) {
		console.error(match.rows);
		return res.redirect('./?error=true');
	}

	await season.update(data, req.getDBOptions());

	const redir = req.body.next ?? './?saved=true';
	res.redirect(redir);
});

module.exports = {
	root: '/config',
	router: router
};
