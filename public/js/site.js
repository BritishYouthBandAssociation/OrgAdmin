'use strict';

(function() {
	function styleElFromLabel(el, label){
		el.style.backgroundColor = label.BackgroundColour;
		el.style.color = label.ForegroundColour;
		el.innerHTML = label.Name;
		el.dataset.type = label.id;
	}

	function initLabelButtons(labels) {
		const elements = document.querySelectorAll('.label-container .add');
		elements.forEach(el => {
			let results = null;
			let search = null;
			let noneFound = null;
			const create = null;

			function clear(){
				el.parentElement.removeChild(results);
				results = null;
				search = null;
			}

			el.addEventListener('click', (e) => {
				e.preventDefault();

				if (results == null) {
					const existing = Array.from(el.parentElement.querySelectorAll('[data-type]')).map(e => e.dataset.type);
					results = document.createElement('div');
					results.className = 'search-results-container';
					el.parentElement.appendChild(results);

					let added = 0;
					labels.forEach(l => {
						if (existing.some(e => e == l.id)) {
							return;
						}

						const cont = document.createElement('div');
						cont.className = 'search-result';
						styleElFromLabel(cont, l);

						cont.addEventListener('click', () => {
							const placeholder = document.createElement('badge');
							placeholder.className = 'badge placeholder me-3';
							styleElFromLabel(placeholder, l);
							el.parentElement.insertBefore(placeholder, el);
							clear();
						});

						results.appendChild(cont);
						added++;
					});

					noneFound = document.createElement('span');
					noneFound.className = 'fst-italic text-white d-none';
					noneFound.innerHTML = 'No labels found that have not already been added';
					results.appendChild(noneFound);

					if (added === 0){
						noneFound.classList.remove('d-none');
					}
				}

				if (search == null) {
					search = document.createElement('input');
					search.className = 'form-control rounded-0 mb-1';
					search.placeholder = 'Label Name';

					search.addEventListener('keyup', () => {
						let shown = 0;
						results.childNodes.forEach(e => {
							if (e == noneFound || e == search){
								return;
							}

							if (e.innerHTML.indexOf(search.value) > -1){
								e.classList.remove('d-none');
								shown++;
							} else {
								e.classList.add('d-none');
							}
						});

						if (shown > 0){
							noneFound.classList.add('d-none');
						} else {
							noneFound.classList.remove('d-none');
						}
					});

					results.insertBefore(search, results.firstChild);
					search.focus();
				}
			});
		});
	}

	fetch('/_api/labels').then(res => res.json()).then(json => initLabelButtons(json));
})();