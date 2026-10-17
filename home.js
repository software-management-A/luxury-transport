(()=>{
  const intro=document.getElementById('carIntro');
  const video=document.getElementById('introVideo');
  const skip=document.getElementById('skipIntro');
  let closed=false;

  const closeIntro=()=>{
    if(closed)return;
    closed=true;
    intro?.classList.add('done');
    sessionStorage.setItem('ltd_intro_seen','1');
    setTimeout(()=>intro?.remove(),500);
  };

  if(sessionStorage.getItem('ltd_intro_seen')==='1'||matchMedia('(prefers-reduced-motion: reduce)').matches){
    intro?.remove();
  }else{
    skip?.addEventListener('click',closeIntro);
    video?.addEventListener('ended',closeIntro);
    video?.addEventListener('error',closeIntro);
    if(video){
      video.muted=true;
      const playPromise=video.play();
      if(playPromise?.catch) playPromise.catch(()=>{});
    }
  }

  const db=window.supabaseClient,box=document.getElementById('publicReviews'),avg=document.getElementById('reviewAverage');
  if(!db||!box)return;
  db.from('customer_reviews').select('rating,review_text,display_name,created_at').eq('is_approved',true).order('created_at',{ascending:false}).limit(10).then(({data,error})=>{
    if(error||!data?.length)return;
    const mean=data.reduce((s,r)=>s+Number(r.rating||0),0)/data.length;
    avg.textContent=`★ ${mean.toFixed(1)} • ${data.length} review${data.length===1?'':'s'}`;
    box.innerHTML=data.map(r=>`<article class="review-card"><div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div><strong>${esc(r.display_name||'Verified Customer')}</strong><p>${esc(r.review_text)}</p><small>${new Date(r.created_at).toLocaleDateString('en-AE')}</small></article>`).join('');
  });
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
})();
