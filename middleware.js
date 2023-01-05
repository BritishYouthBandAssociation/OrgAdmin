'use strict';

function resolveDynamicAccessor(object, accessor){
	if (typeof accessor == 'string'){
		return object[accessor];
	}

	for (let i = 0; i < accessor.length; i++){
		object = object[accessor[i]];

		if (object == null){
			return null;
		}
	}

	return object;
}

module.exports = {
	checkAdmin(req, res, next){
		if (!req.session.user.IsAdmin) {
			return res.redirect('/no-access');
		}

		next();
	},

	matchingID(paramProp, sessionProp){
		return (req, res, next) => {
			const id = resolveDynamicAccessor(req.params, paramProp);
			const valueToCheck = resolveDynamicAccessor(req.session, sessionProp);

			if (id != valueToCheck && !req.session.user.IsAdmin){
				return res.redirect('/no-access');
			}

			next();
		};
	}
};