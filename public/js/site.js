'use strict';

(function(){
	function initDropdownStyleHelper(){
		const els = document.querySelectorAll('select.style-by-value');
		els.forEach(e => {
			e.addEventListener('change', () => {
				e.dataset.chosen = e.value;
			});

			if (e.value){
				e.dataset.chosen = e.value;
			}
		});
	}

	initDropdownStyleHelper();
})();