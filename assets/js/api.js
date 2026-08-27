/* ============================================================
   TANTO API CLIENT
   Wraps the production endpoints of the existing Tanto system:

     POST https://sync.tantooffice.com/api/tcm/container_tracking
          { container: "TAKU1234567-5" }
          -> { status, data: { container, activity, act_date } | [], msg }

     POST https://sync.tantooffice.com/api/tcm/get_city_schedule
          { act: "city" }
          -> { status, kota: [ { nama_kota, kode_kota, id_kota } ] }

     POST https://sync.tantooffice.com/api/tcm/get_schedule_multi
          { pol: <id_kota>, listPod[]: <id_kota>, kota_asal: "SURABAYA" }
          -> { status, data: [ { kota_asal, kota_tujuan, jadwal: [...] } ] }

   IMPORTANT (origin policy): the production API verifies the request
   Origin and only accepts requests from https://www.tantonet.com
   (anything else is answered with "Access denied"). When the new
   site is deployed at www.tantonet.com the calls work natively. Local
   development and Vercel preview deployments proxy /api/tcm/* to the
   production API with the correct Origin.
   ============================================================ */
(function () {
  'use strict';

  var PROD = 'https://sync.tantooffice.com/api/tcm/';

  function endpointBase() {
    // The upstream only accepts the exact www.tantonet.com Origin. Local
    // development and Vercel previews use the matching same-origin proxy:
    // dev-server.mjs locally, and api/tcm/[...path].js on Vercel.
    var approvedProduction = location.protocol === 'https:' &&
      location.hostname.toLowerCase() === 'www.tantonet.com';
    return approvedProduction ? PROD : '/api/tcm/';
  }

  async function post(path, params) {
    var body = new URLSearchParams();
    Object.keys(params).forEach(function (k) { body.append(k, params[k]); });
    var res = await fetch(endpointBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString()
    });
    var text = await res.text();
    var payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch (e) { /* keep text for diagnostics */ }
    if (!res.ok) {
      var detail = payload && (payload.msg || payload.message || payload.error);
      if (!detail && text) detail = text.replace(/\s+/g, ' ').slice(0, 160);
      throw new Error('HTTP ' + res.status + (detail ? ': ' + detail : ''));
    }
    if (payload) return payload;
    throw new Error('Upstream rejected the request: ' + text.slice(0, 120));
  }

  window.TANTO_API = {
    /** Live container tracking. Returns normalized result. */
    track: function (container) {
      return post('container_tracking', { container: container.trim().toUpperCase() })
        .then(function (d) {
          if (d && d.status && d.data && d.data.container) {
            return { ok: true, container: d.data.container, activity: d.data.activity, actDate: d.data.act_date };
          }
          return { ok: false, msg: (d && d.msg) || 'No data found' };
        });
    },

    /** City/port list from the schedule system. */
    cities: function () {
      return post('get_city_schedule', { act: 'city' }).then(function (d) {
        if (d && d.status && Array.isArray(d.kota)) return d.kota;
        throw new Error('city list unavailable');
      });
    },

    /** Sailing search. pol/pod are id_kota numbers from the city list. */
    schedule: function (pol, pod, kotaAsal) {
      var params = { pol: String(pol), kota_asal: kotaAsal };
      params['listPod[]'] = String(pod);
      return post('get_schedule_multi', params).then(function (d) {
        if (d && Array.isArray(d.data)) return d.data;
        throw new Error('schedule unavailable');
      });
    }
  };
})();
