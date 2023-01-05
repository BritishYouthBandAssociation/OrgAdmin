'use strict';

module.exports = {
	checkAdmin(req, res, next){
		if (!req.session.user.IsAdmin) {
			return res.redirect('/no-access');
		}

		next();
	}
};