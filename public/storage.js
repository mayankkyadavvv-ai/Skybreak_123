const keys=['skybreak-settings','skybreak_jet_config_v1','skybreak_pilot_profile_v1','skybreak_pilot_name','skybreak_server_url'];
const dialog=document.getElementById('reset-confirmation'),status=document.getElementById('storage-status');
function refresh(){try{const count=keys.filter(key=>localStorage.getItem(key)!==null).length;status.textContent=`${count} of 5 Skybreak storage entries are present on this browser. Saved values are not displayed.`;}catch{status.textContent='Browser storage is unavailable or blocked.';}}
document.getElementById('reset-data').addEventListener('click',()=>dialog.showModal());
document.getElementById('cancel-reset').addEventListener('click',()=>dialog.close());
document.getElementById('confirm-reset').addEventListener('click',()=>{
  try{for(const key of keys)localStorage.removeItem(key);dialog.close();status.textContent='Skybreak saved data was removed from this browser. Close other game tabs before restarting to prevent them saving their current session again.';}
  catch{dialog.close();status.textContent='Some saved data could not be removed. Use your browser’s site-data settings.';}
});
dialog.addEventListener('close',()=>document.getElementById('reset-data').focus());refresh();
