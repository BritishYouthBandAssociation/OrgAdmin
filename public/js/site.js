'use strict';

(function(){
	const hasVue = typeof Vue != 'undefined';

	function initLabelButtons(labels){
		const elements = document.querySelectorAll('.label-container .add');
		if (elements.length > 0 && !hasVue){
			console.warn('Vue was not detected - make sure you\'re handling label addition properly!');
		}

		elements.forEach(el => {
			let results = null;
			let search = null;

			el.addEventListener('click', (e) => {
				e.preventDefault();

				if (results == null){
					results = document.createElement('div');
					results.className = 'search-results-container';
					el.parentElement.appendChild(results);
					console.log(labels);

					labels.forEach(l => {
						const cont = document.createElement('div');
						cont.className = 'search-result';
						cont.innerHTML = l.Name;
						results.appendChild(cont);
					});
				}

				if (search == null){
					search = document.createElement('input');
					search.className = 'form-control mb-1';
					search.placeholder = 'Label Name';
					results.insertBefore(search, results.firstChild);
				}
			});
		});
	}

	initLabelButtons([{id: 1, Name: 'Test', BackgroundColour: '#000', ForegroundColour: '#FFF'}]);
})();