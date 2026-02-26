const SHEET_JSON_URL = "https://script.google.com/macros/s/AKfycbwFvBtiD-8qobeM5putIc9Q7N76HpjuyDCkVaLCkdEJTKaXF8j_l51YK2SdRtbKUaao/exec";
const DEFAULT_LANG = "es";

const CATEGORY_ORDER = [
	"desayunos",
	"entrantes",
	"platosfuertes",
	"casados",
	"postres",
	"cafe",
	"vinos",
];

const TRANSLATIONS = {
	es: {
		loading: "Cargando menú...",
		empty: "No hay platos disponibles en esta categoría.",
		error: "No se pudo cargar el menú.",
		invalidEndpoint: "URL inválida: usa el enlace de Apps Script terminado en /exec.",
		privateDeployment: "El Apps Script no es público. Publica la Web App para 'Cualquiera'.",
		iva: "El precio mostrado incluye el 13% de IVA*",
	},
	en: {
		loading: "Loading menu...",
		empty: "No dishes available in this category.",
		error: "Could not load menu.",
		invalidEndpoint: "Invalid URL: use the Apps Script endpoint ending in /exec.",
		privateDeployment: "The Apps Script is not public. Deploy the Web App for 'Anyone'.",
		iva: "Displayed price includes 13% VAT*",
	},
	fr: {
		loading: "Chargement du menu...",
		empty: "Aucun plat disponible dans cette catégorie.",
		error: "Le menu n'a pas pu être chargé.",
		invalidEndpoint: "URL invalide : utilisez le lien Apps Script qui se termine par /exec.",
		privateDeployment: "Le script Apps n'est pas public. Déployez la Web App pour 'Tout le monde'.",
		iva: "Le prix affiché inclut 13 % de TVA*",
	},
};

const state = {
	lang: DEFAULT_LANG,
	rows: [],
	categories: [],
	categoryIndex: 0,
};

function normalizeText(value) {
	return String(value || "").trim().toLowerCase();
}

function normalizeBool(value) {
	if (typeof value === "boolean") {
		return value;
	}
	const normalized = normalizeText(value);
	return normalized === "true" || normalized === "1" || normalized === "checked";
}

function normalizeCategory(value) {
	return normalizeText(value).replace(/\s+/g, "");
}

function mapRow(row) {
	return {
		id: String(row.id || "").trim(),
		category: normalizeCategory(row.category),
		section: String(row.section || "").trim(),
		lang: normalizeText(row.lang),
		order: Number(row.order) || 0,
		name: String(row.name || "").trim(),
		ingredients: String(row.ingredients || "").trim(),
		price: Number(row.price) || 0,
		active: normalizeBool(row.active),
	};
}

function getDictionary() {
	return TRANSLATIONS[state.lang] || TRANSLATIONS[DEFAULT_LANG];
}

function getQueryParam(name) {
	const params = new URLSearchParams(window.location.search);
	return params.get(name);
}

function getInitialLanguage() {
	const requested = normalizeText(getQueryParam("lang"));
	return ["es", "en", "fr"].includes(requested) ? requested : DEFAULT_LANG;
}

function getInitialCategoryIndex() {
	const raw = Number.parseInt(getQueryParam("cat") || "0", 10);
	return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

function updateUrl() {
	const params = new URLSearchParams(window.location.search);
	params.set("lang", state.lang);
	params.set("cat", String(state.categoryIndex));
	const nextUrl = `${window.location.pathname}?${params.toString()}`;
	window.history.replaceState({}, "", nextUrl);
}

function buildSheetEndpoint(rawUrl) {
	const urlText = String(rawUrl || "").trim();
	if (!urlText) {
		throw new Error("INVALID_WEBAPP_URL");
	}

	try {
		const parsedUrl = new URL(urlText);
		if (!parsedUrl.pathname.endsWith("/exec")) {
			throw new Error("INVALID_WEBAPP_URL");
		}
		return parsedUrl.toString();
	} catch (_error) {
		throw new Error("INVALID_WEBAPP_URL");
	}
}

async function loadRows() {
	const endpoint = buildSheetEndpoint(SHEET_JSON_URL);
	const response = await fetch(endpoint);

	if (!response.ok) {
		throw new Error(`HTTP_${response.status}`);
	}

	const finalUrl = String(response.url || "");
	if (finalUrl.includes("accounts.google.com")) {
		throw new Error("PRIVATE_DEPLOYMENT");
	}

	const contentType = String(response.headers.get("content-type") || "").toLowerCase();
	if (!contentType.includes("application/json")) {
		throw new Error("INVALID_RESPONSE_FORMAT");
	}

	const data = await response.json();
	return Array.isArray(data) ? data.map(mapRow) : [];
}

function buildCategories(rows, lang) {
	const visible = new Set();

	rows.forEach((row) => {
		if (!row.active || row.lang !== lang || !row.category) {
			return;
		}
		visible.add(row.category);
	});

	const ordered = [];
	CATEGORY_ORDER.forEach((category) => {
		if (visible.has(category)) {
			ordered.push(category);
			visible.delete(category);
		}
	});

	Array.from(visible).sort().forEach((category) => ordered.push(category));
	return ordered;
}

function getCategoryLabel(category) {
	const match = state.rows.find((row) => row.category === category && row.lang === state.lang && row.section);
	return match ? match.section : category;
}

function setLanguageButtonsState() {
	const container = document.getElementById("langSwitch");
	if (!container) {
		return;
	}

	const buttons = container.querySelectorAll("button[data-lang]");
	buttons.forEach((button) => {
		const buttonLang = normalizeText(button.dataset.lang);
		button.classList.toggle("active", buttonLang === state.lang);
	});
}

function bindLanguageButtons() {
	const container = document.getElementById("langSwitch");
	if (!container) {
		return;
	}

	const buttons = container.querySelectorAll("button[data-lang]");
	buttons.forEach((button) => {
		if (button.dataset.bound === "1") {
			return;
		}

		button.dataset.bound = "1";
		button.addEventListener("click", () => {
			const nextLang = normalizeText(button.dataset.lang);
			if (!["es", "en", "fr"].includes(nextLang)) {
				return;
			}

			state.lang = nextLang;
			state.categories = buildCategories(state.rows, state.lang);
			state.categoryIndex = 0;

			setLanguageButtonsState();
			updateIvaText();
			updateUrl();
			renderMenuItems();
		});
	});
}

function updateIvaText() {
	const ivaText = document.getElementById("ivaText");
	if (!ivaText) {
		return;
	}
	ivaText.textContent = getDictionary().iva;
}

function createDishElement(item) {
	const article = document.createElement("article");
	article.className = "dish-item";

	const title = document.createElement("h3");
	title.className = "dish-name";
	title.textContent = item.name;
	article.appendChild(title);

	if (item.ingredients) {
		const description = document.createElement("p");
		description.className = "dish-ingredients";
		description.textContent = item.ingredients;
		article.appendChild(description);
	}

	return article;
}

function renderMenuItems() {
	const container = document.getElementById("menuContainer");
	const categoryTitle = document.getElementById("categoryTitle");
	if (!container || !categoryTitle) {
		return;
	}

	container.innerHTML = "";

	const category = state.categories[state.categoryIndex];
	if (!category) {
		categoryTitle.textContent = "";
		const empty = document.createElement("p");
		empty.className = "menu-empty";
		empty.textContent = getDictionary().empty;
		container.appendChild(empty);
		return;
	}

	categoryTitle.textContent = getCategoryLabel(category).toUpperCase();

	const rows = state.rows
		.filter((row) => row.active && row.lang === state.lang && row.category === category)
		.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

	if (rows.length === 0) {
		const empty = document.createElement("p");
		empty.className = "menu-empty";
		empty.textContent = getDictionary().empty;
		container.appendChild(empty);
		return;
	}

	rows.forEach((row) => {
		container.appendChild(createDishElement(row));
	});
}

function navigateCategory(direction) {
	if (state.categories.length === 0) {
		return;
	}

	if (direction === "next") {
		state.categoryIndex = (state.categoryIndex + 1) % state.categories.length;
	} else {
		state.categoryIndex = state.categoryIndex === 0 ? state.categories.length - 1 : state.categoryIndex - 1;
	}

	updateUrl();
	renderMenuItems();
}

function bindCategoryNavigation() {
	const prevArrow = document.getElementById("prevArrow");
	const nextArrow = document.getElementById("nextArrow");

	if (prevArrow) {
		prevArrow.addEventListener("click", () => navigateCategory("prev"));
	}

	if (nextArrow) {
		nextArrow.addEventListener("click", () => navigateCategory("next"));
	}
}

function setLoading() {
	const container = document.getElementById("menuContainer");
	if (!container) {
		return;
	}
	container.innerHTML = `<p class="menu-loading">${getDictionary().loading}</p>`;
}

function setError(error) {
	const container = document.getElementById("menuContainer");
	if (!container) {
		return;
	}

	const dictionary = getDictionary();
	const message = error && error.message === "INVALID_WEBAPP_URL"
		? dictionary.invalidEndpoint
		: error && error.message === "PRIVATE_DEPLOYMENT"
			? dictionary.privateDeployment
			: dictionary.error;

	container.innerHTML = `<p class="menu-error">${message}</p>`;
}

async function boot() {
	state.lang = getInitialLanguage();
	setLanguageButtonsState();
	bindLanguageButtons();
	bindCategoryNavigation();
	updateIvaText();
	setLoading();

	try {
		state.rows = await loadRows();
		state.categories = buildCategories(state.rows, state.lang);
		state.categoryIndex = Math.min(getInitialCategoryIndex(), Math.max(state.categories.length - 1, 0));
		updateUrl();
		renderMenuItems();
	} catch (error) {
		console.error("Error cargando menú:", error);
		setError(error);
	}
}

boot();
