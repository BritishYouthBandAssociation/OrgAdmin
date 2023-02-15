'use strict';

(function() {
	function styleElFromLabel(el, label) {
		el.style.backgroundColor = label.BackgroundColour;
		el.style.color = label.ForegroundColour;
		el.style.setProperty('--bs-border-color', label.BackgroundColour);
		el.innerHTML = label.Name;
		el.dataset.type = label.id;
	}

	function createCreate() {
		const create = document.createElement('div');
		create.className = 'search-result d-none';

		create.addEventListener('click', () => {
			console.log(create);
		});

		create.tabIndex = 0;
		return create;
	}

	function deleteLabel(label) {
		label.classList.add('placeholder');

		fetch(`/_api/membership/${label.parentElement.dataset.membership}/labels/${label.dataset.type}`, {
			method: 'DELETE'
		}).then((res) => {
			if (!res.ok) {
				throw new Error(res.status);
			}

			label.remove();
		}).catch(() => {
			label.classList.remove('placeholder');
			alert('An error occurred - please try again');
		});
	}

	function initLabelButtons(labels) {
		const elements = document.querySelectorAll('.label-container .add');
		elements.forEach(el => {
			let results = null;
			let search = null;
			let noneFound = null;
			let create = null;

			function clear() {
				if (results != null){
					results.remove();
				}

				search = null;
				create = null;
				results = null;
			}

			function addLabel(label) {
				const placeholder = document.createElement('span');
				placeholder.className = 'badge placeholder me-3 my-1 border';
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
					if (!res.ok) {
						throw new Error(res.status);
					}

					return res.json();
				}).then(json => {
					if (json.success) {
						placeholder.classList.remove('placeholder');
						placeholder.addEventListener('click', () => deleteLabel(placeholder));
					}
				}).catch(() => {
					placeholder.remove();
					alert('An error occurred - please try again');
				});
			}

			el.parentElement.parentElement.addEventListener('focusout', (e) => {
				//Grr
				//https://stackoverflow.com/questions/21926083/failed-to-execute-removechild-on-node
				setTimeout(() => {
					if (!e.relatedTarget || !el.parentElement.parentElement.contains(e.relatedTarget)) {
						clear();
					}
				}, 1);
			});

			const labelElements = el.parentElement.querySelectorAll('span.badge');
			labelElements.forEach(label => {
				label.addEventListener('click', () => deleteLabel(label));
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
						cont.tabIndex = 0;
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
						const query = search.value.toLowerCase();

						results.childNodes.forEach(e => {
							if (e == noneFound || e == search || e == create) {
								return;
							}

							if (e.innerHTML.toLowerCase().indexOf(query) > -1) {
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

						if (query.length == 0) {
							create.classList.add('d-none');
						} else {
							create.innerHTML = `Create label "${search.value}"`;
							create.dataset.name = search.value;
							create.classList.remove('d-none');
						}
					});

					results.insertBefore(search, results.firstChild);
					search.focus();
				}

				if (create == null) {
					create = createCreate();
					results.appendChild(create);
				}
			});
		});
	}

	fetch('/_api/labels').then(res => res.json()).then(json => initLabelButtons(json));
})();