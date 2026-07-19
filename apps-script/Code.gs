/**
 * 관극노트 백엔드 — Google Apps Script
 *
 * 설치 방법 (자세한 내용은 리포지토리 README.md 참고):
 * 1. Google 스프레드시트를 새로 만든다.
 * 2. 확장 프로그램 → Apps Script 를 열고 이 파일 내용을 붙여넣는다.
 * 3. 프로젝트 설정(⚙️) → 스크립트 속성에 ADMIN_TOKEN 속성을 추가한다.
 *    (관리자 로그인에 사용할 비밀번호. 길고 추측하기 어려운 값 권장)
 * 4. 배포 → 새 배포 → 유형: 웹 앱
 *    - 실행 계정: 나
 *    - 액세스 권한: 모든 사용자
 * 5. 발급된 웹 앱 URL을 GitHub 리포지토리의 APPS_SCRIPT_URL 시크릿에 등록한다.
 */

var SHEET_NAME = 'records';
var POSTER_FOLDER_NAME = 'MusicalNote-Posters';
var HEADERS = [
  'id', 'title', 'venue', 'viewDate', 'cast', 'seat', 'runningTime',
  'synopsis', 'rating', 'review', 'posterUrl', 'isPublic',
  'createdAt', 'updatedAt'
];

function doGet(e) {
  return respond(handleRequest((e && e.parameter) || {}));
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {}
  return respond(handleRequest(body));
}

function handleRequest(req) {
  try {
    var isAdmin = checkToken(req.token);
    switch (req.action) {
      case 'list':
        return { ok: true, admin: isAdmin, records: listRecords(isAdmin) };
      case 'verify':
        return { ok: true, admin: isAdmin };
      case 'create':
        requireAdmin(isAdmin);
        return { ok: true, record: createRecord(req.record || {}) };
      case 'update':
        requireAdmin(isAdmin);
        return { ok: true, record: updateRecord(req.record || {}) };
      case 'delete':
        requireAdmin(isAdmin);
        deleteRecord(req.id);
        return { ok: true };
      case 'uploadPoster':
        requireAdmin(isAdmin);
        return { ok: true, url: uploadPoster(req.data, req.mimeType) };
      default:
        return { ok: false, error: '알 수 없는 요청입니다: ' + req.action };
    }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken(token) {
  var saved = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return !!(saved && token && token === saved);
}

function requireAdmin(isAdmin) {
  if (!isAdmin) throw new Error('관리자 인증에 실패했습니다.');
}

function getSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowToRecord(row) {
  var rec = {};
  for (var i = 0; i < HEADERS.length; i++) {
    var v = row[i];
    if (v instanceof Date) v = Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
    rec[HEADERS[i]] = v === undefined || v === null ? '' : v;
  }
  rec.rating = rec.rating === '' ? 0 : Number(rec.rating);
  rec.isPublic = rec.isPublic === true || rec.isPublic === 'TRUE' || rec.isPublic === 'true';
  return rec;
}

function recordToRow(rec) {
  return HEADERS.map(function (h) {
    var v = rec[h];
    if (h === 'isPublic') return v ? 'TRUE' : 'FALSE';
    return v === undefined || v === null ? '' : v;
  });
}

function listRecords(isAdmin) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var records = values.map(rowToRecord).filter(function (r) { return r.id; });
  if (!isAdmin) {
    records = records.filter(function (r) { return r.isPublic; });
  }
  return records;
}

function findRowById(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function sanitizeRecord(rec) {
  var out = {};
  HEADERS.forEach(function (h) {
    out[h] = rec[h] === undefined || rec[h] === null ? '' : rec[h];
  });
  out.isPublic = rec.isPublic === true || rec.isPublic === 'true' || rec.isPublic === 'TRUE';
  out.rating = Number(rec.rating) || 0;
  return out;
}

function createRecord(rec) {
  var sheet = getSheet();
  var now = new Date().toISOString();
  var clean = sanitizeRecord(rec);
  clean.id = Utilities.getUuid();
  clean.createdAt = now;
  clean.updatedAt = now;
  sheet.appendRow(recordToRow(clean));
  return clean;
}

function updateRecord(rec) {
  var sheet = getSheet();
  var rowIndex = findRowById(sheet, rec.id);
  if (rowIndex < 0) throw new Error('해당 기록을 찾을 수 없습니다.');
  var existing = rowToRecord(
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
  );
  var clean = sanitizeRecord(rec);
  clean.id = existing.id;
  clean.createdAt = existing.createdAt;
  clean.updatedAt = new Date().toISOString();
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([recordToRow(clean)]);
  return clean;
}

function deleteRecord(id) {
  var sheet = getSheet();
  var rowIndex = findRowById(sheet, id);
  if (rowIndex < 0) throw new Error('해당 기록을 찾을 수 없습니다.');
  sheet.deleteRow(rowIndex);
}

/**
 * base64 이미지를 Google Drive에 저장하고 외부에서 볼 수 있는 URL을 돌려준다.
 */
function uploadPoster(base64Data, mimeType) {
  if (!base64Data) throw new Error('이미지 데이터가 없습니다.');
  var folder = getPosterFolder();
  var ext = (mimeType || 'image/jpeg').split('/')[1] || 'jpg';
  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType || 'image/jpeg',
    'poster-' + Date.now() + '.' + ext
  );
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

function getPosterFolder() {
  var folders = DriveApp.getFoldersByName(POSTER_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(POSTER_FOLDER_NAME);
}

/**
 * (선택) 에디터에서 한 번 실행하면 시트와 헤더를 미리 만들어 준다.
 */
function setup() {
  getSheet();
}
