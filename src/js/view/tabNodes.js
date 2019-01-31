import { forEachTab } from './tabs.js';
import { tabDragStart, tabDragEnter, tabDragOver, tabDragLeave, tabDrop, tabDragEnd } from './drag.js';
import { new_element } from './utils.js';

var tabNodes = {};
var activeTabId = -1; // tabid of active tab in view

export function getTabNode(tabId){
	return tabNodes[ tabId ].tab;
}

export async function initTabNodes(tabId) {

    const tabs = await getLastActiveTabs(tabId);

    if(tabs.length == 0) return;

    activeTabId = tabs[0].id;
    tabs.forEach((tab, i) => {
        makeTabNode(tab, i == 0);
        updateTabNode(tab);
        updateFavicon(tab);
        updateThumbnail(tab.id);
    });
}

export function makeTabNode(tab, selected = false) {

	var thumbnail = new_element('div', {class: 'thumbnail'});
	var favicon = new_element('div', {class: 'favicon'});
	var close = new_element('div', {class: 'close', title: 'Close Tab'});
	var name = new_element('div', {class: 'name'});

	var inner = new_element('div', {class: 'inner'}, [
		thumbnail,
		favicon,
		close,
		name
	])

	var node = new_element('div', {class: selected ? 'tab selected' : 'tab', draggable: 'true', tabId: tab.id}, [inner]);

	node.addEventListener('click', async function(event) {
		event.preventDefault();
		event.stopPropagation();

		await browser.tabs.update(tab.id, {active: true});
	}, false);

	node.addEventListener('auxclick', function(event) {
		event.preventDefault();
		event.stopPropagation();

		if (event.button == 1) { // middle mouse
			browser.tabs.remove(tab.id);
		}
	}, false);

	close.addEventListener('click', function(event) {
		event.stopPropagation();
		browser.tabs.remove(tab.id);
	}, false);

	node.addEventListener('dragstart', tabDragStart, false);
	node.addEventListener('dragenter', tabDragEnter, false);
	node.addEventListener('dragover', tabDragOver, false);
	node.addEventListener('dragleave', tabDragLeave, false);
	node.addEventListener('drop', tabDrop, false);
	node.addEventListener('dragend', tabDragEnd, false);

	tabNodes[tab.id] = {
		tab: node,
		inner: inner,
		thumbnail: thumbnail,
		favicon: favicon,
		close: close,
		name: name
	};
}

export async function updateTabNode(tab) {

	var node = tabNodes[tab.id];

	if(node) {
		node.name.innerHTML = '';
		node.name.appendChild(document.createTextNode(tab.title));

		node.inner.title = tab.title + ((tab.url.substr(0, 5) !== 'data:') ? ' - ' + decodeURI(tab.url) : '');

		if ( tab.discarded ) {
			node.tab.classList.add('inactive');
		} else {
			node.tab.classList.remove('inactive');
		}

		if ( tab.pinned ) {
			node.tab.classList.add( 'pinned' )
			node.tab.style.width = '';
			node.tab.style.height = '';
		} else {
			node.tab.classList.remove( 'pinned' )
		}
	}
}

/**
 * Find the most recently accessed tab and give its thumbnail the selected
 * class, removing selected from all other thumbnails
 */
export async function setActiveTabNode(tabId) {
    const tabs = await getLastActiveTabs(tabId);

    activeTabId = tabs.shift().id;
    tabNodes[activeTabId].tab.classList.add('selected');

    for(const tab of tabs){
        // Can race if deleteTabNode is called at the same time (e.g. every time
        // the active tab is closed, since a new tab becomes active), so confirm
        // the tab is still in tabNodes
        if (tabNodes[tab.id]) {
            tabNodes[tab.id].tab.classList.remove('selected');
        }
    }
}

async function getLastActiveTabs(tabId) {
    return await browser.tabs.query({ currentWindow: true })
        .then(tabs => tabs
            .filter(tab => tab.id !== tabId)
            .sort((a, b) => a.lastAccessed < b.lastAccessed));
}

// Remove selected from all other thumbnails, add to tab with id given
export async function setActiveTabNodeById(tabId) {
    await forEachTab(async function(tab) {
        if (tabNodes[tab.id]) {
            tabNodes[tab.id].tab.classList.remove('selected');
        }
    });
    tabNodes[tabId].tab.classList.add('selected');
    activeTabId = tabId;
}

export function getActiveTabId() {
    return activeTabId;
}

export function deleteTabNode(tabId) {
	if(tabNodes[tabId]) {
		tabNodes[tabId].tab.parentNode.removeChild(tabNodes[tabId].tab);
		delete tabNodes[tabId];
	}
}

export async function updateThumbnail(tabId, thumbnail) {
	var node = tabNodes[tabId];

	if(node) {
		if(!thumbnail) {
			thumbnail = await browser.sessions.getTabValue(tabId, 'thumbnail');
		}

		if(thumbnail) {
			node.thumbnail.style.backgroundImage = 'url(' + thumbnail + ')';
		}else{
			node.thumbnail.style.backgroundImage = '';
		}
	}
}

async function testImage(url) {
	return new Promise(function (resolve, reject) {

		var img = new Image();

		img.onerror = img.onabort = function () {
			reject("error");
		};

		img.onload = function () {
			resolve("success");
		};

		img.src = url;
	});
}

export async function updateFavicon(tab) {

	var node = tabNodes[tab.id];

	if(node) {
		if(tab.favIconUrl &&
			tab.favIconUrl.substr(0, 22) != 'chrome://mozapps/skin/' &&
			tab.favIconUrl != tab.url) {
			testImage(tab.favIconUrl).then(
				_ => {
					node.favicon.style.backgroundImage = 'url(' + tab.favIconUrl + ')';
					node.favicon.classList.add('visible');
				}, _ => {
					node.favicon.style.backgroundImage = '';
					node.favicon.classList.remove('visible');
				}
			);
		}else{
			node.favicon.classList.remove('visible');
		}
	}
}
