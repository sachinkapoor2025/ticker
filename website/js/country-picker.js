/**
 * Searchable country picker — replaces large <select name="country"> lists.
 * Keeps a hidden input/select with the chosen country value for form posts.
 */
(function () {
  "use strict";

  var COUNTRIES = [
    "United States of America","Afghanistan","Albania","Algeria","American Samoa","Andorra","Angola","Anguilla",
    "Antigua & Barbuda","Argentina","Armenia","Aruba","Australia","Austria","Azerbaijan","Bahamas","Bahrain",
    "Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bermuda","Bhutan","Bolivia","Bonaire",
    "Bosnia & Herzegovina","Botswana","Brazil","British Indian Ocean Ter","Brunei","Bulgaria","Burkina Faso",
    "Burundi","Cambodia","Cameroon","Canada","Canary Islands","Cape Verde","Cayman Islands","Central African Republic",
    "Chad","Channel Islands","Chile","China","Christmas Island","Cocos Island","Colombia","Comoros","Congo",
    "Cook Islands","Costa Rica","Cote DIvoire","Croatia","Cuba","Curacao","Cyprus","Czech Republic","Denmark",
    "Djibouti","Dominica","Dominican Republic","East Timor","Ecuador","Egypt","El Salvador","Equatorial Guinea",
    "Eritrea","Estonia","Ethiopia","Falkland Islands","Faroe Islands","Fiji","Finland","France","French Guiana",
    "French Polynesia","French Southern Ter","Gabon","Gambia","Georgia","Germany","Ghana","Gibraltar","Great Britain",
    "Greece","Greenland","Grenada","Guadeloupe","Guam","Guatemala","Guinea","Guyana","Haiti","Hawaii","Honduras",
    "Hong Kong","Hungary","Iceland","Indonesia","India","Iran","Iraq","Ireland","Isle of Man","Israel","Italy",
    "Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Korea North","Korea South","Kuwait","Kyrgyzstan",
    "Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Macau",
    "Macedonia","Madagascar","Malaysia","Malawi","Maldives","Mali","Malta","Marshall Islands","Martinique",
    "Mauritania","Mauritius","Mayotte","Mexico","Midway Islands","Moldova","Monaco","Mongolia","Montenegro",
    "Montserrat","Morocco","Mozambique","Myanmar","Nambia","Nauru","Nepal","Netherland Antilles","Netherlands",
    "Nevis","New Caledonia","New Zealand","Nicaragua","Niger","Nigeria","Niue","Norfolk Island","Norway","Oman",
    "Pakistan","Palau Island","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Pitcairn Island",
    "Poland","Portugal","Puerto Rico","Qatar","Republic of Montenegro","Republic of Serbia","Reunion","Romania",
    "Russia","Rwanda","St Barthelemy","St Eustatius","St Helena","St Kitts-Nevis","St Lucia","St Maarten",
    "St Pierre & Miquelon","St Vincent & Grenadines","Saipan","Samoa","Samoa American","San Marino","Sao Tome & Principe",
    "Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands",
    "Somalia","South Africa","Spain","Sri Lanka","Sudan","Suriname","Swaziland","Sweden","Switzerland","Syria",
    "Tahiti","Taiwan","Tajikistan","Tanzania","Thailand","Togo","Tokelau","Tonga","Trinidad & Tobago","Tunisia",
    "Turkey","Turkmenistan","Turks & Caicos Is","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom",
    "Uruguay","Uzbekistan","Vanuatu","Vatican City State","Venezuela","Vietnam","Virgin Islands (Brit)",
    "Virgin Islands (USA)","Wake Island","Wallis & Futana Is","Yemen","Zambia","Zimbabwe"
  ];

  function enhanceSelect(select) {
    if (!select || select.dataset.tpEnhanced === "1") return;
    if (select.classList.contains("country-select") || select.classList.contains("country-select2")) {
      // Dial-code selects are short lists; leave alone unless huge
      if (select.options.length < 40) return;
    }
    // Only enhance large country name lists
    if (select.options.length < 40 && select.id !== "country") return;
    // Skip hidden dial/invalid duplicates that are display:none
    var style = window.getComputedStyle(select);
    if (style.display === "none" || select.closest('[style*="display:none"]')) return;

    select.dataset.tpEnhanced = "1";
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    select.style.position = "absolute";
    select.style.left = "-9999px";
    select.style.height = "1px";
    select.style.width = "1px";
    select.style.opacity = "0";

    var wrap = document.createElement("div");
    wrap.className = "tp-country-wrap";
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    var input = document.createElement("input");
    input.type = "text";
    input.className = "tp-country-input";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "country-name");
    input.placeholder = "Search country…";
    input.required = select.required;
    wrap.appendChild(input);

    var list = document.createElement("ul");
    list.className = "tp-country-list";
    list.setAttribute("role", "listbox");
    wrap.appendChild(list);

    var names = [];
    if (select.options.length > 5) {
      for (var i = 0; i < select.options.length; i++) {
        var t = (select.options[i].textContent || "").trim();
        var v = select.options[i].value;
        if (t && v) names.push({ label: t, value: v });
      }
    } else {
      names = COUNTRIES.map(function (c) {
        return { label: c, value: c };
      });
    }

    var active = -1;
    var filtered = names.slice();

    function setSelectValue(label, value) {
      var found = false;
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === value || select.options[i].textContent.trim() === label) {
          select.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        var opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        select.appendChild(opt);
        select.value = value;
      }
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function render() {
      list.innerHTML = "";
      filtered.slice(0, 80).forEach(function (item, idx) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tp-country-option" + (idx === active ? " is-active" : "");
        btn.setAttribute("role", "option");
        btn.textContent = item.label;
        btn.addEventListener("mousedown", function (e) {
          e.preventDefault();
          input.value = item.label;
          setSelectValue(item.label, item.value);
          close();
        });
        li.appendChild(btn);
        list.appendChild(li);
      });
    }

    function open() {
      list.classList.add("is-open");
      input.setAttribute("aria-expanded", "true");
    }
    function close() {
      list.classList.remove("is-open");
      input.setAttribute("aria-expanded", "false");
      active = -1;
    }

    function filter(q) {
      q = (q || "").toLowerCase().trim();
      filtered = !q
        ? names.slice()
        : names.filter(function (n) {
            return n.label.toLowerCase().indexOf(q) !== -1;
          });
      active = filtered.length ? 0 : -1;
      render();
      open();
    }

    input.addEventListener("focus", function () {
      filter(input.value);
    });
    input.addEventListener("input", function () {
      filter(input.value);
    });
    input.addEventListener("blur", function () {
      setTimeout(close, 150);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        active = Math.min(active + 1, filtered.length - 1);
        render();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        active = Math.max(active - 1, 0);
        render();
      } else if (e.key === "Enter") {
        if (active >= 0 && filtered[active]) {
          e.preventDefault();
          input.value = filtered[active].label;
          setSelectValue(filtered[active].label, filtered[active].value);
          close();
        }
      } else if (e.key === "Escape") {
        close();
      }
    });

    // Prefill USA if empty selected
    if (select.value) {
      var selText = select.options[select.selectedIndex]
        ? select.options[select.selectedIndex].textContent.trim()
        : select.value;
      input.value = selText;
    }
  }

  function enhanceDialCodeSelect(select) {
    if (!select || select.dataset.tpEnhanced === "1") return;
    if (!select.classList.contains("country-select2") && !select.classList.contains("country-select")) return;
    function tryEnhance() {
      if (select.dataset.tpEnhanced === "1") return;
      if (select.options.length >= 10) enhanceSelect(select);
    }
    tryEnhance();
    setTimeout(tryEnhance, 400);
    setTimeout(tryEnhance, 1200);
    if (window.MutationObserver) {
      var obs = new MutationObserver(function () { tryEnhance(); });
      obs.observe(select, { childList: true });
      setTimeout(function () { obs.disconnect(); }, 5000);
    }
  }

  function init() {
    document.querySelectorAll('select[name="country"].input-select, select#country.input-select').forEach(enhanceSelect);
    document.querySelectorAll("select.country-select2, select.country-select").forEach(enhanceDialCodeSelect);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
