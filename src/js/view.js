
'use strict';

function new_element(name, attributes, children) {

	const e = document.createElement(name);

	for(const key in attributes) {
		if(key == 'content') {
			e.appendChild(document.createTextNode(attributes[key]));
		}else{
			e.setAttribute(key.replace(/_/g, '-'), attributes[key]);
		}
	}

	for(const child of children || []) {
		e.appendChild(child);
	}

	return e;
}

var background = browser.extension.getBackgroundPage();

var view = {
	windowId: -1,
	tabId: -1,
	groupsNode: null,
	dragIndicator: null,

	screenshotInterval: null,

	tabs: {},
};

async function captureThumbnail(tabId) {

	var data = await browser.tabs.captureTab(tabId, {format: 'jpeg', quality: 25});
	var img = new Image;

	img.onload = async function() {
		var canvas = document.createElement('canvas');
		var ctx = canvas.getContext('2d');

		canvas.width = 500;
		canvas.height = canvas.width * (this.height / this.width);

		//ctx.imageSmoothingEnabled = true;
		//ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(this, 0, 0, canvas.width, canvas.height);

		var thumbnail = canvas.toDataURL('image/jpeg', 0.7);

		updateThumbnail(tabId, thumbnail);
		browser.sessions.setTabValue(tabId, 'thumbnail', thumbnail);
	};

	img.src = data;
}

async function captureTabs() {
	const tabs = browser.tabs.query({currentWindow: true, discarded: false});

	for(const tab of await tabs) {
		captureThumbnail(tab.id);
	}
}

async function initView() {

	view.windowId = (await browser.windows.getCurrent()).id;
	view.tabId = (await browser.tabs.getCurrent()).id;
	view.groupsNode = document.getElementById('groups');

	view.dragIndicator = new_element('div', {class: 'drag_indicator'});
	view.groupsNode.appendChild(view.dragIndicator);

	await groups.init();

	// init Nodes
	await initTabNodes();
	await initGroupNodes();

	// set all listeners
	document.getElementById('newGroup').addEventListener('click', createGroup, false);

	document.getElementById('groups').addEventListener('auxclick', async function(event) {
		event.preventDefault();
		event.stopPropagation();

		if ( event.target != document.getElementById('groups') ) return; // ignore middle clicks in foreground
		if ( event.button != 1 ) return; // middle mouse

		createGroup();
	}, false);

	document.addEventListener('visibilitychange', function() {
		if(document.hidden) {
			//clearInterval(view.screenshotInterval);
		}else{
			//view.screenshotInterval = setInterval(captureTabs, 5000);
			captureTabs();
		}
	}, false);

	browser.tabs.onCreated.addListener(tabCreated);
	browser.tabs.onRemoved.addListener(tabRemoved);

	browser.tabs.onUpdated.addListener(tabUpdated);
	browser.tabs.onMoved.addListener(tabMoved);

	browser.tabs.onAttached.addListener(tabAttached);
	browser.tabs.onDetached.addListener(tabDetached);

	browser.tabs.onActivated.addListener(tabActivated);
}


document.addEventListener('DOMContentLoaded', initView, false);


async function createGroup() {
	var group = await groups.create();
	makeGroupNode(group);
	var groupElement = groupNodes[group.id].group
	view.groupsNode.appendChild(groupElement);
	updateGroupFit(group);
	groupElement.scrollIntoView({behavior: "smooth"});
}


async function tabCreated(tab) {
	if(view.windowId == tab.windowId){
		makeTabNode(tab);
		updateTabNode(tab);
		updateFavicon(tab);

		var groupId = undefined;

		while(groupId === undefined) {
			groupId = await view.tabs.getGroupId(tab.id);
		}

		var group = groups.get(groupId);
		await insertTab(tab);
		updateGroupFit(group);
	}
}

function tabRemoved(tabId, removeInfo) {
	if(view.windowId == removeInfo.windowId && view.tabId != tabId){
		deleteTabNode(tabId);
		groups.forEach(function(group) {
			updateGroupFit(group);
		});
	}
}

async function tabUpdated(tabId, changeInfo, tab) {
	if(view.windowId == tab.windowId){
		updateTabNode(tab);
		updateFavicon(tab);
		//captureThumbnail(tabId);
	}
}

async function tabMoved(tabId, moveInfo) {
	if(view.windowId == moveInfo.windowId){
		browser.tabs.get(tabId).then(async function(tab) {
			await insertTab(tab);
			groups.forEach(async function(group) {
				updateGroupFit(group);
			});
		});
	}
}

function tabAttached(tabId, attachInfo) {
	console.log('tab attached', attachInfo.newWindowId);
	if(view.windowId == attachInfo.newWindowId){
		browser.tabs.get(tabId).then(tab => {
			tabCreated(tab);
		});
	}
}

function tabDetached(tabId, detachInfo) {
	console.log('tab detached', detachInfo.oldWindowId);
	if(view.windowId == detachInfo.oldWindowId){
		deleteTabNode(tabId);
		groups.forEach(function(group) {
			updateGroupFit(group);
		});
	}
}

async function tabActivated(activeInfo) {
	setActiveTabNode();
}
