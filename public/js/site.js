'use strict';

(function() {
	function styleElFromLabel(el, label) {
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

			function clear() {
				el.parentElement.removeChild(results);
				results = null;
				search = null;
			}

			function addLabel(label) {
				const placeholder = document.createElement('badge');
				placeholder.className = 'badge placeholder me-3';
				styleElFromLabel(placeholder, label);
				el.parentElement.insertBefore(placeholder, el);
				clear();

				fetch(`/_api/membership/${el.parentElement.dataset.membership}/labels/add`, {
					method: 'POST',
					body: JSON.stringify({
						labelID: label.id
					}),
					headers: {
						'Content-Type': 'application/json'
					}
				}).then(res => {
					if (!res.ok){
						throw new Error(res.status);
					}

					return res.json();
				}).then(json => {
					if (json.success){
						placeholder.classList.remove('placeholder');
					}
				}).catch(() => {
					placeholder.remove();
					alert('An error occurred - please try again');
				});
			}

			const labels = el.parentElement.querySelectorAll('span.badge');
			labels.forEach(label => {
				label.addEventListener('click', () => {
					label.classList.add('placeholder');

					fetch(`/_api/membership/${label.parentElement.dataset.membership}/labels/${label.dataset.type}`, {
						method: 'DELETE'
					}).then((res) => {
						if (!res.ok){
							throw new Error(res.status);
						}

						label.remove();
					})
						.catch(() => {
							label.classList.remove('placeholder');
							alert('An error occurred - please try again');
						});
				});
			});

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
							addLabel(l);
						});

						results.appendChild(cont);
						added++;
					});

					noneFound = document.createElement('span');
					noneFound.className = 'fst-italic text-white d-none';
					noneFound.innerHTML = 'No labels found that have not already been added';
					results.appendChild(noneFound);

					if (added === 0) {
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
							if (e == noneFound || e == search) {
								return;
							}

							if (e.innerHTML.indexOf(search.value) > -1) {
								e.classList.remove('d-none');
								shown++;
							} else {
								e.classList.add('d-none');
							}
						});

						if (shown > 0) {
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
	initDropdownStyleHelper();
})();