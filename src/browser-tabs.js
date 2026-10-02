'use strict';

function tabError() { return Object.assign(new Error('tab_not_found: select an existing game tab'), {code:'tab_not_found'}); }
class BrowserTabs {
  constructor(options) { this.options=options; }
  summary(tab) {
    const wc=tab.view?.webContents;
    return {id:tab.id,type:tab.kind,title:wc?.getTitle?.() || tab.title || '',
      url:wc?.getURL?.() || tab.url || '',loadState:wc?.isLoading?.() ? 'loading':'complete',
      active:this.options.getActiveTab?.()?.id === tab.id};
  }
  list() { return this.options.listTabs().map(tab=>this.summary(tab)); }
  resolve(id) {
    if (id !== undefined && (!Number.isInteger(id) || id < 1)) throw tabError();
    const tab=id === undefined ? this.options.getActiveTab?.() : this.options.listTabs().find(tab=>tab.id===id);
    if (!tab || tab.kind !== 'game' || !tab.view?.webContents || tab.view.webContents.isDestroyed()) throw tabError();
    return tab;
  }
  async new({url='about:blank',activate=true}={}) {
    if (typeof activate !== 'boolean') throw new Error('activate must be boolean');
    if (url !== 'about:blank' && (typeof url !== 'string' || !['http:','https:'].includes(new URL(url).protocol))) throw new Error('url must be HTTP or HTTPS');
    const tab=await this.options.createTab(url,{activate});
    await tab.navigationReady;
    return this.summary(tab);
  }
  activate(id) { const tab=this.resolve(id); this.options.activateTab(tab.id);return this.summary(tab); }
  async close(id) {
    const tab=this.resolve(id);
    if (tab.recorder?.recording) throw new Error('Save the HAR before closing this recording tab');
    await this.options.closeTab(tab.id,{createReplacement:false});
    return {closed:tab.id};
  }
}
module.exports={BrowserTabs};
