"""Small native menu-audit helpers. Only real keyboard/gamepad menu input."""
import base64,json,time
from bridge import ROOT,call
D=ROOT/'docs/evidence/m10-completion'
def state():return call('engine_menu_input',timeout=10)
def pad(button):
 buttons=[0]*(button+1);buttons[button]=1
 call('engine_menu_input',{'gamepad':{'buttons':buttons,'axes':[]},'holdMs':0},timeout=10)
 time.sleep(.15);return state()
def save(name):
 m=state();(D/('menu-'+name+'.json')).write_text(json.dumps(m,indent=2)+'\n')
 r=call('engine_screenshot',{'format':'jpeg','maxWidth':1200},timeout=15)
 (D/('menu-'+name+'.jpg')).write_bytes(base64.b64decode(r['mcpImage']['data']))
 return m
def brief(m):return {'file':m['file'],'presentation':m['presentation'],'focused':next((c for c in m['controls'] if c['focused']),None),'controls':[{'label':c['label'],'value':c['value']}for c in m['controls']]}
if __name__=='__main__':
 save('title');print('down',brief(pad(13)));print('right',brief(pad(15)));pad(0);time.sleep(.5);print('options',json.dumps(brief(save('options'))))
