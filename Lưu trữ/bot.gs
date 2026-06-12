// DÁN CHANNEL ACCESS TOKEN CỦA LINE BOT VÀO PROPERTIES (Chọn LINE BOT -> Cấu hình -> Cập nhật TOKEN)
// Không hard-code token/LIFF_ID trong code để bảo mật.

var globalCurrentUserName = "Hệ thống";
var _colIndexCache = {};

function getToken() {
  var token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) {
    writeLog("LINE_CHANNEL_ACCESS_TOKEN is missing! Please set it via LINE BOT menu.", "ERROR", "getToken");
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is missing! Please configure it using Google Sheet -> LINE BOT menu.");
  }
  return token;
}

function getLiffId() {
  var liffId = PropertiesService.getScriptProperties().getProperty("LIFF_ID");
  if (!liffId) {
    liffId = getSetting("LIFF_ID", "");
  }
  return liffId || "2010371497-R9x4l665"; // Default fallback
}

function getLiffUrl() {
  return "https://liff.line.me/" + getLiffId();
}

// ==========================================
// 0. MENU TRÊN GOOGLE SHEET
// ==========================================
function onOpen() {
  // Tự động cấu hình LIFF ID của bạn vào hệ thống nếu chưa có
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LIFF_ID')) {
    props.setProperty('LIFF_ID', '2010371497-R9x4l665');
  }
  
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 LINE BOT')
      .addItem('🩺 Kiểm tra sức khỏe bot', 'CHAY_KIEM_TRA_SUC_KHOE_BOT')
      .addItem('🔄 Tạo lại trigger', 'SETUP_TRIGGERS')
      .addItem('🧹 Dọn Logs', 'DON_DEP_LOGS_MENU')
      .addItem('⚙️ Xem cấu hình', 'XEM_CAU_HINH_MENU')
      .addItem('🔄 Khôi phục cấu hình (Rollback)', 'ROLLBACK_CAU_HINH_MENU')
      .addSeparator()
      .addSubMenu(ui.createMenu('🔧 Cấu hình chuyên sâu')
          .addItem('🔑 Cập nhật TOKEN vào Script Properties', 'CAP_NHAT_TOKEN_MENU')
          .addItem('📱 Cập nhật LIFF ID', 'CAP_NHAT_LIFF_ID_MENU')
          .addItem('👥 Cập nhật Admin User IDs', 'CAP_NHAT_ADMIN_USER_IDS_MENU')
      )
      .addSeparator()
      .addItem('1. Khởi tạo Bảng Dữ Liệu', 'SETUP_KHOI_TAO_HETHONG')
      .addItem('2. Dọn dẹp dòng rác/trống', 'XOA_DONG_RÁC')
      .addSeparator()
      .addItem('📱 3. Mở Form Giao Việc (LINE LIFF)', 'OPEN_LIFF_FORM')
      .addItem('🔍 4. Chạy Quét Việc Thủ Công & Xem Log', 'CHAY_QUET_VIEC_THU_CONG')
      .addSeparator()
      .addItem('🧹 Làm sạch Sự kiện', 'LAM_SACH_SU_KIEN')
      .addItem('🧹 Làm sạch Tương tác', 'LAM_SACH_TUONG_TAC')
      .addSeparator()
      .addItem('🎛️ Tạo Rich Menu', 'SETUP_RICH_MENU')
      .addItem('🖼️ Upload ảnh Rich Menu', 'UPLOAD_RICH_MENU_IMAGE_FROM_DRIVE')
      .addItem('✅ Đặt Rich Menu mặc định', 'SET_DEFAULT_RICH_MENU')
      .addItem('🧪 Test LIFF URL', 'TEST_LIFF_URL')
      .addToUi();
}

function SETUP_KHOI_TAO_HETHONG() {
  try {
    ensureSheetAndHeaders();
  } catch (e) {
    writeLog("Lỗi khởi tạo hệ thống: " + e.toString(), "ERROR");
  }
  
  // Tự động tạo trigger đồng bộ dự án
  try {
    SETUP_TRIGGERS();
  } catch (e) {
    writeLog("Lỗi tự động cài trigger khi khởi tạo: " + e.toString(), "WARNING");
  }
  
  try {
    SpreadsheetApp.getUi().alert("✅ Đã cập nhật hệ thống, khởi tạo đầy đủ các bảng dữ liệu và đồng bộ Trình Kích Hoạt thành công!");
  } catch (uiErr) {}
}

// ==========================================
// CÁC HÀM CŨ (NHẮC VIỆC, WEBHOOK, LƯU DỮ LIỆU...)
// ==========================================
function checkAndSendLineMessage() {
  writeLog("Bắt đầu quét sự kiện nhắc việc...", "INFO");
  try {
    var sheet = getSpreadsheet().getSheetByName("Sự kiện");
    if (!sheet) {
      writeLog("Không tìm thấy sheet 'Sự kiện'", "WARN");
      return;
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      writeLog("Không có sự kiện nào trong danh sách.", "INFO");
      return;
    }
    
    var lastCol = sheet.getLastColumn();
    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    
    var expectedHeaders = ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"];
    var actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
    
    var colTaskId = getColumnIndexByHeader(sheet, "Task ID");
    var colStatus = getColumnIndexByHeader(sheet, "Trạng thái");
    var colLichSu = getColumnIndexByHeader(sheet, "Lịch sử cập nhật");
    var colDaNhacPre = getColumnIndexByHeader(sheet, "Đã nhắc trước deadline");
    var colLanNhacCuoi = getColumnIndexByHeader(sheet, "Lần nhắc cuối");
    var colSoLanNhac = getColumnIndexByHeader(sheet, "Số lần nhắc");
    
    // Map to expected 23 columns
    var data = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var newRow = [];
      for (var j = 0; j < expectedHeaders.length; j++) {
        var hName = expectedHeaders[j];
        var idx = actualHeaders.indexOf(hName);
        if (idx !== -1 && idx < row.length) {
          newRow.push(row[idx]);
        } else {
          newRow.push("");
        }
      }
      data.push(newRow);
    }
    
    var currentTime = new Date();
    var processedCount = 0;
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i], rowIndex = i + 2; 
      
      var tenSuKien = row[0];
      // Bỏ qua dòng trống
      if (String(tenSuKien).trim() === "") continue;
      
      var status = String(row[11] || "").trim();
      if (status === "Đã gửi" || status === "Đã hủy") continue;
      
      var taskId = colTaskId !== -1 ? values[i][colTaskId - 1] : "";
      var idG = row[5];
      var idNV = row[6];
      var tanSuat = parseInt(row[7]) || 15;
      var hinhThucXN = String(row[8]).trim();
      var uuTien = row[9];
      
      writeLog("Đang xử lý sự kiện: '" + tenSuKien + "' (Dòng " + rowIndex + ")", "INFO");
      
      // Parse ngày giờ gửi
      var tgGui = convertToDate(row[2]);
      if (!tgGui) {
        writeLog("❌ Lỗi: Ngày giờ gửi không hợp lệ ở Dòng " + rowIndex + ": '" + row[2] + "'", "WARN");
        continue;
      }
      
      if (idG === "") {
        writeLog("⚠️ Lỗi: Không có ID Nhóm nhận ở Dòng " + rowIndex, "WARN");
        continue;
      }
      
      // Khởi tạo extraData từ các cột bổ sung
      var extraData = {
        deadline: row[15],
        loaiCV: row[16],
        nguoiGiao: row[17],
        nguoiTheoDoi: row[18],
        ghiChu: row[19],
        trangThaiChiTiet: status,
        lichSu: row[21],
        idNV: idNV,
        daNhacPreDeadline: row[22] // Cột 23 / Cột W
      };
      
      // 1. Kiểm tra QUÁ HẠN (Deadline)
      if (extraData.deadline) {
        var deadlineVal = convertToDate(extraData.deadline);
        if (deadlineVal && currentTime > deadlineVal && status !== "Quá hạn") {
          if (colStatus !== -1) sheet.getRange(rowIndex, colStatus).setValue("Quá hạn");
          
          var oldStatus = status;
          status = "Quá hạn";
          extraData.trangThaiChiTiet = "Quá hạn";
          
          var existingHistory = colLichSu !== -1 ? sheet.getRange(rowIndex, colLichSu).getValue() : "";
          var newHistory = "Hệ thống: Quá hạn hoàn thành lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm");
          if (colLichSu !== -1) sheet.getRange(rowIndex, colLichSu).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
          
          appendTaskLog(taskId, "Đổi trạng thái", oldStatus, "Quá hạn", "Hệ thống tự động đánh dấu quá hạn");
          
          var alertMsg = "⚠️ CẢNH BÁO QUÁ HẠN: Công việc '" + tenSuKien + "' đã quá hạn hoàn thành (Hạn: " + formatDateTimeDisplay(deadlineVal) + ")!";
          try {
            var tagStr = idNV;
            if (extraData.nguoiTheoDoi) {
              tagStr = tagStr ? tagStr + "," + extraData.nguoiTheoDoi : extraData.nguoiTheoDoi;
            }
            sendLinePush(idG, tenSuKien, alertMsg, "", "Không", rowIndex, tagStr, 3, "GẤP", extraData);
            writeLog("Gửi cảnh báo quá hạn công việc '" + tenSuKien + "' (Dòng " + rowIndex + ")", "INFO");
          } catch (alertErr) {
            writeLog("❌ Lỗi gửi cảnh báo quá hạn: " + alertErr.toString(), "ERROR");
          }
        }
      }
      
      // 2. Kiểm tra SẮP ĐẾN HẠN (Nhắc trước deadline 30 phút)
      if (extraData.deadline && status !== "Đã gửi" && status !== "Đã hủy" && status !== "Quá hạn") {
        var deadlineVal = convertToDate(extraData.deadline);
        if (deadlineVal) {
          var minsToDeadline = (deadlineVal.getTime() - currentTime.getTime()) / 60000;
          var daNhacPre = String(row[22] || "").trim(); // Cột W
          if (minsToDeadline > 0 && minsToDeadline <= 30 && daNhacPre !== "Có") {
            if (colDaNhacPre !== -1) sheet.getRange(rowIndex, colDaNhacPre).setValue("Có");
            row[22] = "Có";
            extraData.daNhacPreDeadline = "Có";
            
            var warnMsg = "⏰ SẮP ĐẾN HẠN: Công việc '" + tenSuKien + "' sắp đến hạn hoàn thành vào lúc " + formatDateTimeDisplay(deadlineVal) + " (còn khoảng " + Math.round(minsToDeadline) + " phút)!";
            try {
              sendLinePush(idG, tenSuKien, warnMsg, "", "Không", rowIndex, idNV, 1, "Quan trọng", extraData);
              writeLog("Gửi nhắc sắp đến hạn công việc '" + tenSuKien + "' (Dòng " + rowIndex + ")", "INFO");
            } catch (warnErr) {
              writeLog("❌ Lỗi gửi nhắc sắp đến hạn: " + warnErr.toString(), "ERROR");
            }
          }
        }
      }
      
      // Kiểm tra đến giờ gửi chưa
      if (currentTime >= tgGui) {
        var hinhAnh = chuyenDoiLinkDrive(row[3]); 
        var lanNhacCuoi = convertToDate(row[12]) || new Date(0);
        var soLan = parseInt(row[13]) || 0;
        
        // Lấy thông tin Tên Nhóm và Tên Thành Viên để ghi log chi tiết
        var groupName = getGroupName(idG);
        var memberName = idNV ? resolveMemberNamesList(idNV, idG) : "Không có";
        
        if (hinhThucXN !== "Không" && hinhThucXN !== "") {
          var minsDiff = (currentTime - lanNhacCuoi) / 60000;
          if (minsDiff >= tanSuat || lanNhacCuoi.getTime() === 0) {
            soLan += 1;
            writeLog("Gửi tin nhắn nhắc việc: '" + tenSuKien + "' lần thứ " + soLan + " (Dòng " + rowIndex + ") | Nhóm: '" + groupName + "' | Phụ trách: '" + memberName + "'", "INFO");
            try {
              sendLinePush(idG, tenSuKien, row[1], hinhAnh, hinhThucXN, rowIndex, idNV, soLan, uuTien, extraData);
              var curStatus = colStatus !== -1 ? sheet.getRange(rowIndex, colStatus).getValue() : "";
              if (curStatus !== "Chờ gửi ảnh" && 
                  curStatus !== "Chờ gửi ảnh + ghi chú" && 
                  curStatus !== "Chờ ghi chú nghiệm thu" && 
                  curStatus !== "Cần hỗ trợ" && 
                  curStatus !== "Đang làm" && 
                  curStatus !== "Quá hạn") {
                if (colStatus !== -1) sheet.getRange(rowIndex, colStatus).setValue("Chờ xác nhận");
                appendTaskLog(taskId, "Đổi trạng thái", curStatus, "Chờ xác nhận", "Nhắc nhở công việc lần " + soLan);
              }
              if (colLanNhacCuoi !== -1) sheet.getRange(rowIndex, colLanNhacCuoi).setValue(currentTime);
              if (colSoLanNhac !== -1) sheet.getRange(rowIndex, colSoLanNhac).setValue(soLan);
              processedCount++;
            } catch (err) {
              writeLog("❌ Lỗi gửi LINE API (Dòng " + rowIndex + "): " + err.toString(), "ERROR");
            }
          } else {
            writeLog("Nhắc việc '" + tenSuKien + "' (Dòng " + rowIndex + ") đang chờ cách lần cuối " + Math.round(minsDiff) + " phút / tần suất " + tanSuat + " phút", "INFO");
          }
        } else if (hinhThucXN === "Không") {
          writeLog("Gửi tin nhắn thông báo (Không xác nhận): '" + tenSuKien + "' (Dòng " + rowIndex + ") | Nhóm: '" + groupName + "' | Phụ trách: '" + memberName + "'", "INFO");
          try {
            sendLinePush(idG, tenSuKien, row[1], hinhAnh, "Không", rowIndex, idNV, soLan, uuTien, extraData);
            if (colStatus !== -1) sheet.getRange(rowIndex, colStatus).setValue("Đã gửi");
            appendTaskLog(taskId, "Đổi trạng thái", status, "Đã gửi", "Gửi thông báo hoàn tất (không yêu cầu xác nhận)");
            processedCount++;
            
            // Xử lý lặp lại
            if (row[4] !== "Không" && row[4] !== "") {
              try {
                taoDongTiepTheo(sheet, rowIndex);
                writeLog("Đã tạo dòng lặp lại '" + row[4] + "' cho sự kiện '" + tenSuKien + "'", "INFO");
              } catch (repeatErr) {
                writeLog("❌ Lỗi khi tạo dòng lặp lại (Dòng " + rowIndex + "): " + repeatErr.toString(), "ERROR");
              }
            }
          } catch (err) {
            writeLog("❌ Lỗi gửi LINE API (Dòng " + rowIndex + "): " + err.toString(), "ERROR");
          }
        }
      } else {
        var diffSecs = Math.round((tgGui - currentTime) / 1000);
        writeLog("Sự kiện '" + tenSuKien + "' chưa tới giờ gửi. (Còn " + diffSecs + " giây)", "INFO");
      }
    }
    writeLog("Hoàn thành quét sự kiện. Số lượng tin đã xử lý: " + processedCount, "INFO");
  } catch (e) {
    writeLog("❌ Lỗi hệ thống trong checkAndSendLineMessage: " + e.toString(), "ERROR");
  }
}

function taoDongTiepTheo(sheet, rowIndex) {
  var lastCol = sheet.getLastColumn();
  var r = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  var expectedHeaders = ["Task ID", "Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"];
  var actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  
  var getVal = function(hName) {
    var idx = actualHeaders.indexOf(hName);
    return (idx !== -1 && idx < r.length) ? r[idx] : "";
  };
  
  var tgGuiVal = getVal("Ngày giờ gửi");
  var d = convertToDate(tgGuiVal);
  if (!d) {
    writeLog("⚠️ Lỗi lặp lại: Ngày giờ gốc không hợp lệ ở Dòng " + rowIndex + ": " + tgGuiVal, "ERROR");
    return;
  }
  
  var lapLaiVal = getVal("Lặp lại");
  var originalD = new Date(d.getTime());
  if (lapLaiVal === "Hàng giờ") d.setHours(d.getHours() + 1);
  else if (lapLaiVal === "Hàng ngày") d.setDate(d.getDate() + 1);
  else if (lapLaiVal === "Hàng tuần") d.setDate(d.getDate() + 7);
  var timeDiff = d.getTime() - originalD.getTime();
  
  var newTaskId = generateTaskId(d);
  
  var newRow = [];
  for (var j = 0; j < expectedHeaders.length; j++) {
    var hName = expectedHeaders[j];
    if (hName === "Task ID") {
      newRow.push(newTaskId);
    } else if (hName === "Ngày giờ gửi") {
      newRow.push(d);
    } else if (hName === "Người xác nhận" || hName === "Trạng thái" || hName === "Lần nhắc cuối" || hName === "Số lần nhắc" || hName === "Link Ảnh Nghiệm Thu" || hName === "Trạng thái xử lý chi tiết" || hName === "Lịch sử cập nhật" || hName === "Đã nhắc trước deadline") {
      newRow.push("");
    } else if (hName === "Deadline") {
      var deadlineVal = getVal("Deadline");
      var deadlineD = deadlineVal ? convertToDate(deadlineVal) : null;
      if (deadlineD) {
        deadlineD.setTime(deadlineD.getTime() + timeDiff);
        newRow.push(deadlineD);
      } else {
        newRow.push("");
      }
    } else {
      newRow.push(getVal(hName));
    }
  }
  
  ghiDuLieuThongMinh(sheet, newRow);
  
  // Log creation
  appendTaskLog(newTaskId, "Tạo việc mới", "", "Chờ xác nhận", "Tạo việc lặp lại tự động từ Dòng " + rowIndex);
}

function ghiDuLieuThongMinh(sheet, dataArray) {
  var colA = sheet.getRange("A:A").getValues();
  var insertRow = sheet.getLastRow() + 1;
  for (var i = 1; i < colA.length; i++) { if (String(colA[i][0]).trim() === "") { insertRow = i + 1; break; } }
  var lastCol = Math.max(dataArray.length, sheet.getLastColumn() || 15);
  sheet.getRange(insertRow, 1, 1, lastCol).clearContent();
  sheet.getRange(insertRow, 1, 1, dataArray.length).setValues([dataArray]);
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    
    // Nếu là API request từ LIFF Form
    if (postData && postData.action === "createTask") {
      var result = createTaskFromLIFF(postData.data);
      return ContentService.createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
    }
    
    var events = postData.events;
    if (!events || events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({content: "ok"}))
          .setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = getSpreadsheet();
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      try {
        if (event.type === "message") {
          var uId = event.source.userId, gId = event.source.groupId, msgType = event.message.type;
          
          // Tự động đăng ký Thành viên / Nhóm
          var name = "Nhân viên";
          try {
            if (uId) {
              var sMem = ss.getSheetByName("ID_Member");
              var memValues = sMem.getDataRange().getValues();
              var existingRow = memValues.find(r => r[1] === uId);
              if (existingRow) {
                name = existingRow[0];
              } else {
                name = getUserName(uId, gId);
                sMem.appendRow([name, uId]); 
              }
            }
            if (gId) {
              var sG = ss.getSheetByName("ID_Group");
              if (!sG.getDataRange().getValues().some(r => r[1] === gId)) { 
                sG.appendRow([getGroupName(gId), gId]); 
              }
            }
          } catch (err) {
            writeLog("Lỗi đăng ký TV/Nhóm: " + err.toString(), "ERROR");
          }
          
          globalCurrentUserName = name; // set performer!
          
          // Xử lý tin nhắn text ở cả chat riêng và nhóm
          if (msgType === "text") {
            var text = event.message.text.trim().toLowerCase();
            var originalText = event.message.text.trim();
            
            // Log webhook nhận text
            try {
              writeLog("Webhook text: " + text + " | userId=" + uId + " | groupId=" + gId, "INFO");
            } catch (err) {}
            
            // Kiểm tra phản hồi ghi chú nghiệm thu
            if (gId) {
              var sEv = ss.getSheetByName("Sự kiện");
              var colStatus = getColumnIndexByHeader(sEv, "Trạng thái");
              var colXN = getColumnIndexByHeader(sEv, "Người xác nhận");
              var colNhom = getColumnIndexByHeader(sEv, "Nhóm nhận");
              var colGhiChu = getColumnIndexByHeader(sEv, "Ghi chú");
              var colLichSu = getColumnIndexByHeader(sEv, "Lịch sử cập nhật");
              var colLap = getColumnIndexByHeader(sEv, "Lặp lại");
              var colTaskId = getColumnIndexByHeader(sEv, "Task ID");
              
              if (sEv && colStatus !== -1 && colXN !== -1 && colNhom !== -1) {
                var evData = sEv.getDataRange().getValues();
                var handledNote = false;
                for (var j = 1; j < evData.length; j++) {
                  var rowNhom = evData[j][colNhom - 1];
                  var rowStatus = evData[j][colStatus - 1];
                  var rowXN = evData[j][colXN - 1];
                  
                  if (rowNhom === gId && rowStatus === "Chờ ghi chú nghiệm thu" && rowXN === name) {
                    var taskId = colTaskId !== -1 ? evData[j][colTaskId - 1] : "";
                    sEv.getRange(j+1, colStatus).setValue("Đã gửi");
                    
                    var existingNote = colGhiChu !== -1 ? sEv.getRange(j+1, colGhiChu).getValue() : "";
                    var newNote = existingNote ? existingNote + "\nNghiệm thu: " + originalText : "Nghiệm thu: " + originalText;
                    if (colGhiChu !== -1) sEv.getRange(j+1, colGhiChu).setValue(newNote);
                    
                    var existingHistory = colLichSu !== -1 ? sEv.getRange(j+1, colLichSu).getValue() : "";
                    var newHistory = "Hoàn tất bởi " + name + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm") + "\nGhi chú: " + originalText;
                    if (colLichSu !== -1) sEv.getRange(j+1, colLichSu).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
                    
                    var lapVal = colLap !== -1 ? evData[j][colLap - 1] : "Không";
                    if (lapVal !== "Không") taoDongTiepTheo(sEv, j+1);
                    
                    appendTaskLog(taskId, "Đổi trạng thái", "Chờ ghi chú nghiệm thu", "Đã gửi", "Gửi ghi chú nghiệm thu: " + originalText);
                    sendLineReply(event.replyToken, "🎉 Nghiệm thu hoàn tất! Ghi chú nghiệm thu đã được lưu: \"" + originalText + "\"");
                    handledNote = true;
                    break;
                  }
                }
                if (handledNote) continue;
              }
            }
            
            var handled = handleTextCommand(event, originalText, uId, gId);
            if (handled) continue;
          }
          
          // Xử lý ảnh nghiệm thu (Chỉ chạy trong nhóm)
          if (msgType === "image" && gId) {
            var sEv = ss.getSheetByName("Sự kiện");
            var colStatus = getColumnIndexByHeader(sEv, "Trạng thái");
            var colXN = getColumnIndexByHeader(sEv, "Người xác nhận");
            var colNhom = getColumnIndexByHeader(sEv, "Nhóm nhận");
            var colAnhNT = getColumnIndexByHeader(sEv, "Link Ảnh Nghiệm Thu");
            var colLichSu = getColumnIndexByHeader(sEv, "Lịch sử cập nhật");
            var colLap = getColumnIndexByHeader(sEv, "Lặp lại");
            var colTaskId = getColumnIndexByHeader(sEv, "Task ID");
            var colTenSuKien = getColumnIndexByHeader(sEv, "Tên sự kiện");
            
            if (sEv && colStatus !== -1 && colXN !== -1 && colNhom !== -1) {
              var evData = sEv.getDataRange().getValues();
              var matchingTasks = [];
              
              for (var j = 1; j < evData.length; j++) {
                var rowNhom = evData[j][colNhom - 1];
                var rowXN = evData[j][colXN - 1];
                
                if (rowNhom === gId && rowXN === name) {
                  var currentStatus = evData[j][colStatus - 1];
                  if (currentStatus === "Chờ gửi ảnh" || currentStatus === "Chờ gửi ảnh + ghi chú") {
                    matchingTasks.push({
                      rowIndex: j + 1,
                      taskId: colTaskId !== -1 ? evData[j][colTaskId - 1] : "",
                      taskName: colTenSuKien !== -1 ? evData[j][colTenSuKien - 1] : "Công việc",
                      status: currentStatus,
                      lapVal: colLap !== -1 ? evData[j][colLap - 1] : "Không"
                    });
                  }
                }
              }
              
              if (matchingTasks.length === 1) {
                var task = matchingTasks[0];
                var imgUrl = luuAnhVaoDrive(event.message.id, name, task.taskName, 1);
                
                if (task.status === "Chờ gửi ảnh") {
                  sEv.getRange(task.rowIndex, colStatus).setValue("Đã gửi"); 
                  if (colAnhNT !== -1) sEv.getRange(task.rowIndex, colAnhNT).setValue(imgUrl);
                  
                  var history = "Nghiệm thu ảnh bởi " + name + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm");
                  if (colLichSu !== -1) sEv.getRange(task.rowIndex, colLichSu).setValue(history);
                  
                  if (task.lapVal !== "Không") taoDongTiepTheo(sEv, task.rowIndex);
                  
                  appendTaskLog(task.taskId, "Đổi trạng thái", task.status, "Đã gửi", "Nghiệm thu bằng ảnh hoàn thành (tự động)");
                  sendLineReply(event.replyToken, "📸 Đã nghiệm thu ảnh cho việc: " + task.taskName); 
                } else if (task.status === "Chờ gửi ảnh + ghi chú") {
                  sEv.getRange(task.rowIndex, colStatus).setValue("Chờ ghi chú nghiệm thu"); 
                  if (colAnhNT !== -1) sEv.getRange(task.rowIndex, colAnhNT).setValue(imgUrl);
                  
                  var history = "Đã gửi ảnh bởi " + name + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm") + ". Đang chờ ghi chú.";
                  if (colLichSu !== -1) sEv.getRange(task.rowIndex, colLichSu).setValue(history);
                  
                  appendTaskLog(task.taskId, "Đổi trạng thái", task.status, "Chờ ghi chú nghiệm thu", "Gửi ảnh thành công, chờ gửi tiếp ghi chú (tự động)");
                  sendLineReply(event.replyToken, "✅ Đã nhận ảnh nghiệm thu cho việc: " + task.taskName + "\nVui lòng gửi tiếp một tin nhắn văn bản làm Ghi chú nghiệm thu.");
                }
              } else if (matchingTasks.length > 1) {
                var flexMsg = buildTaskSelectionFlex(matchingTasks, event.message.id);
                replyMessages(event.replyToken, [flexMsg], "LINE select task flex reply");
              }
            }
          }
          
          // Cập nhật tương tác nhóm
          if (gId) {
            capNhatTuongTac(gId, uId, name, msgType);
          }
        }
        
        if (event.type === "postback") {
          var d = event.postback.data, rIdx = parseInt(d.split("&row=")[1]), sEv = ss.getSheetByName("Sự kiện");
          var uName = getUserName(event.source.userId, event.source.groupId);
          globalCurrentUserName = uName; // Set performer context!
          
          var colStatus = getColumnIndexByHeader(sEv, "Trạng thái");
          var colXN = getColumnIndexByHeader(sEv, "Người xác nhận");
          var colLichSu = getColumnIndexByHeader(sEv, "Lịch sử cập nhật");
          var colLap = getColumnIndexByHeader(sEv, "Lặp lại");
          var colNgayGui = getColumnIndexByHeader(sEv, "Ngày giờ gửi");
          var colLanNhac = getColumnIndexByHeader(sEv, "Lần nhắc cuối");
          var colSoLan = getColumnIndexByHeader(sEv, "Số lần nhắc");
          var colTaskId = getColumnIndexByHeader(sEv, "Task ID");
          var colTenSuKien = getColumnIndexByHeader(sEv, "Tên sự kiện");
          
          if (sEv && colStatus !== -1 && colTaskId !== -1) {
            var currentStatus = sEv.getRange(rIdx, colStatus).getValue();
            var taskId = sEv.getRange(rIdx, colTaskId).getValue();
            var taskName = colTenSuKien !== -1 ? sEv.getRange(rIdx, colTenSuKien).getValue() : "Công việc";
            
            if (currentStatus !== "Đã gửi" && currentStatus !== "Đã hủy") {
              if (d.includes("action=confirm_image")) {
                var colAnhNT = getColumnIndexByHeader(sEv, "Link Ảnh Nghiệm Thu");
                var msgId = d.split("&msgId=")[1];
                var imgUrl = luuAnhVaoDrive(msgId, uName, taskName, 1);
                
                if (currentStatus === "Chờ gửi ảnh") {
                  sEv.getRange(rIdx, colStatus).setValue("Đã gửi"); 
                  if (colAnhNT !== -1) sEv.getRange(rIdx, colAnhNT).setValue(imgUrl);
                  if (colXN !== -1) sEv.getRange(rIdx, colXN).setValue(uName);
                  
                  var history = "Nghiệm thu ảnh bởi " + uName + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm");
                  if (colLichSu !== -1) sEv.getRange(rIdx, colLichSu).setValue(history);
                  
                  var lapVal = colLap !== -1 ? sEv.getRange(rIdx, colLap).getValue() : "Không";
                  if (lapVal !== "Không") taoDongTiepTheo(sEv, rIdx);
                  
                  appendTaskLog(taskId, "Đổi trạng thái", currentStatus, "Đã gửi", "Nghiệm thu bằng ảnh hoàn thành (qua postback)");
                  sendLineReply(event.replyToken, "📸 Đã nghiệm thu ảnh thành công cho việc: " + taskName); 
                } else if (currentStatus === "Chờ gửi ảnh + ghi chú") {
                  sEv.getRange(rIdx, colStatus).setValue("Chờ ghi chú nghiệm thu"); 
                  if (colAnhNT !== -1) sEv.getRange(rIdx, colAnhNT).setValue(imgUrl);
                  if (colXN !== -1) sEv.getRange(rIdx, colXN).setValue(uName);
                  
                  var history = "Đã gửi ảnh bởi " + uName + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm") + ". Đang chờ ghi chú.";
                  if (colLichSu !== -1) sEv.getRange(rIdx, colLichSu).setValue(history);
                  
                  appendTaskLog(taskId, "Đổi trạng thái", currentStatus, "Chờ ghi chú nghiệm thu", "Gửi ảnh thành công, chờ gửi tiếp ghi chú (qua postback)");
                  sendLineReply(event.replyToken, "✅ Đã nhận ảnh nghiệm thu cho việc: " + taskName + "\nVui lòng gửi tiếp một tin nhắn văn bản làm Ghi chú nghiệm thu.");
                } else {
                  sendLineReply(event.replyToken, "⚠️ Trạng thái công việc hiện tại không còn chờ gửi ảnh (" + currentStatus + ")");
                }
              } else if (d.includes("action=hoantat")) {
                if (colXN !== -1) sEv.getRange(rIdx, colXN).setValue(uName); 
                sEv.getRange(rIdx, colStatus).setValue("Đã gửi");
                var lapVal = colLap !== -1 ? sEv.getRange(rIdx, colLap).getValue() : "Không";
                if (lapVal !== "Không") taoDongTiepTheo(sEv, rIdx);
                appendTaskLog(taskId, "Đổi trạng thái", currentStatus, "Đã gửi", "Người nhận bấm Hoàn tất");
                sendLineReply(event.replyToken, "🎉 " + uName + " đã xong!");
              } else if (d.includes("action=chupanh_ghichu")) {
                if (colXN !== -1) sEv.getRange(rIdx, colXN).setValue(uName); 
                sEv.getRange(rIdx, colStatus).setValue("Chờ gửi ảnh + ghi chú");
                appendTaskLog(taskId, "Đổi trạng thái", currentStatus, "Chờ gửi ảnh + ghi chú", "Người nhận chọn Hoàn tất chụp ảnh + ghi chú");
                sendLineReply(event.replyToken, "📸 Mời bạn gửi ảnh nghiệm thu trước.");
              } else if (d.includes("action=chupanh")) {
                if (colXN !== -1) sEv.getRange(rIdx, colXN).setValue(uName); 
                sEv.getRange(rIdx, colStatus).setValue("Chờ gửi ảnh");
                appendTaskLog(taskId, "Đổi trạng thái", currentStatus, "Chờ gửi ảnh", "Người nhận chọn Hoàn tất chụp ảnh");
                sendLineReply(event.replyToken, "📸 Mời bạn gửi ảnh!");
              } else if (d.includes("action=danglam")) {
                if (colXN !== -1) sEv.getRange(rIdx, colXN).setValue(uName); 
                sEv.getRange(rIdx, colStatus).setValue("Đang làm");
                var existingHistory = colLichSu !== -1 ? sEv.getRange(rIdx, colLichSu).getValue() : "";
                var newHistory = uName + " bắt đầu làm lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm");
                if (colLichSu !== -1) sEv.getRange(rIdx, colLichSu).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
                appendTaskLog(taskId, "Đổi trạng thái", currentStatus, "Đang làm", "Người nhận bắt đầu làm");
                sendLineReply(event.replyToken, "⚡ " + uName + " đã nhận và bắt đầu thực hiện công việc!");
              } else if (d.includes("action=support")) {
                sEv.getRange(rIdx, colStatus).setValue("Cần hỗ trợ");
                var existingHistory = colLichSu !== -1 ? sEv.getRange(rIdx, colLichSu).getValue() : "";
                var newHistory = uName + " báo cần hỗ trợ lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm");
                if (colLichSu !== -1) sEv.getRange(rIdx, colLichSu).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
                var alertMsg = "🆘 CẦN HỖ TRỢ: " + uName + " cần hỗ trợ thực hiện công việc '" + taskName + "'!";
                appendTaskLog(taskId, "Đổi trạng thái", currentStatus, "Cần hỗ trợ", "Người nhận báo cần hỗ trợ");
                sendLineReply(event.replyToken, alertMsg);
              } else if (d.includes("action=delay")) {
                var now = new Date();
                var newTime = new Date();
                var delayText = "";
                if (d.includes("mins=15")) {
                  newTime.setTime(now.getTime() + 15 * 60 * 1000);
                  delayText = "dời 15 phút";
                } else if (d.includes("mins=30")) {
                  newTime.setTime(now.getTime() + 30 * 60 * 1000);
                  delayText = "dời 30 phút";
                } else if (d.includes("mins=tomorrow")) {
                  newTime.setDate(now.getDate() + 1);
                  newTime.setHours(8, 0, 0, 0);
                  delayText = "dời sang sáng mai (08:00)";
                }
                if (colNgayGui !== -1) sEv.getRange(rIdx, colNgayGui).setValue(newTime);
                sEv.getRange(rIdx, colStatus).setValue("Chờ xác nhận");
                if (colLanNhac !== -1) sEv.getRange(rIdx, colLanNhac).setValue("");
                if (colSoLan !== -1) sEv.getRange(rIdx, colSoLan).setValue(0);
                var existingHistory = colLichSu !== -1 ? sEv.getRange(rIdx, colLichSu).getValue() : "";
                var newHistory = uName + " đã dời việc (" + delayText + ") lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm");
                if (colLichSu !== -1) sEv.getRange(rIdx, colLichSu).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
                var replyMsg = "🕒 " + uName + " đã dời công việc '" + taskName + "' (" + delayText + ").\nThời gian nhắc mới: " + formatDateTimeDisplay(newTime);
                appendTaskLog(taskId, "Dời thời gian", currentStatus, "Chờ xác nhận", "Dời thời gian nhắc nhở: " + delayText);
                sendLineReply(event.replyToken, replyMsg);
              } else if (d.includes("action=huy")) {
                var uId = event.source.userId;
                if (canManageTask(uId, rIdx)) {
                  sEv.getRange(rIdx, colStatus).setValue("Đã hủy");
                  var existingHistory = colLichSu !== -1 ? sEv.getRange(rIdx, colLichSu).getValue() : "";
                  var newHistory = uName + " hủy việc lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm");
                  if (colLichSu !== -1) sEv.getRange(rIdx, colLichSu).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
                  appendTaskLog(taskId, "Hủy việc", currentStatus, "Đã hủy", "Hủy việc qua postback");
                  sendLineReply(event.replyToken, "❌ " + uName + " đã hủy công việc dòng " + rIdx + "!");
                } else {
                  sendLineReply(event.replyToken, "🚫 Bạn không có quyền hủy công việc này!");
                }
              }
            }
          }
        }
      } catch (errEvent) {
        try {
          writeLog("Lỗi xử lý sự kiện: " + errEvent.toString(), "ERROR");
        } catch (e) {}
      }
    }
    return ContentService.createTextOutput(JSON.stringify({content: "ok"}))
        .setMimeType(ContentService.MimeType.JSON);
  } catch (errGlobal) {
    try {
      writeLog("Lỗi toàn cục doPost: " + errGlobal.toString(), "ERROR");
    } catch (e) {}
    return ContentService.createTextOutput(JSON.stringify({content: "error", message: errGlobal.toString()}))
        .setMimeType(ContentService.MimeType.JSON);
  }
}

function getGroupName(groupId) {
  try {
    var res = callLineApi("group/" + groupId + "/summary", { method: "get", muteHttpExceptions: true }, "Lấy tên nhóm");
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText()).groupName;
    }
  } catch (e) {
    writeLog("Lỗi lấy tên nhóm: " + e.toString(), "WARNING", "getGroupName");
  }
  return "Nhóm cũ";
}

function luuAnhVaoDrive(messageId, userName, taskName, index) {
  var res = callLineApi("https://api-data.line.me/v2/bot/message/" + messageId + "/content", { method: "get" }, "Tải ảnh tin nhắn");
  var blob = res.getBlob();
  
  var now = new Date();
  var yearMonth = Utilities.formatDate(now, Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "yyyy-MM");
  
  var parentFolderName = "BOT - LINE";
  var parentFolders = DriveApp.getFoldersByName(parentFolderName);
  var parentFolder = parentFolders.hasNext() ? parentFolders.next() : DriveApp.createFolder(parentFolderName);
  parentFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  var subFolders = parentFolder.getFoldersByName(yearMonth);
  var folder = subFolders.hasNext() ? subFolders.next() : parentFolder.createFolder(yearMonth);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  var ymd_hm = Utilities.formatDate(now, Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "yyyyMMdd_HHmm");
  var safeEmp = removeVietnameseTones(userName || "Staff");
  var safeTask = removeVietnameseTones(taskName || "Task");
  var idxStr = ("0" + (index || 1)).slice(-2);
  
  var safeName = ymd_hm + "_" + safeEmp + "_" + safeTask + "_" + idxStr + ".jpg";
  blob.setName(safeName);
  
  var file = folder.createFile(blob);
  var fileId = file.getId();
  var directLink = "https://lh3.googleusercontent.com/d/" + fileId;
  
  var sheet = getSpreadsheet().getSheetByName("Link_img");
  if (sheet) sheet.appendRow([safeName, directLink]);
  
  return directLink;
}

function chuyenDoiLinkDrive(url) {
  if (!url) return "";
  var match = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url).match(/id=([a-zA-Z0-9_-]+)/);
  return match ? "https://lh3.googleusercontent.com/d/" + match[1] : url; 
}

function sendBotReply(token, txt, imgUrl) {
  var msgs = [];
  if (txt) msgs.push({ type: "text", text: String(txt) });
  if (imgUrl) {
    var dl = chuyenDoiLinkDrive(imgUrl);
    msgs.push({
      type: "image",
      originalContentUrl: dl,
      previewImageUrl: dl
    });
  }

  if (msgs.length === 0) {
    msgs.push({ type: "text", text: "Bot chưa có nội dung trả lời cho từ khóa này." });
  }

  replyMessages(token, msgs, "LINE chatbot reply");
}


// ==========================================
// HÀM GỬI LINE & FIX LỖI TAG ĐÍCH DANH (CẬP NHẬT MỚI NHẤT)
// ==========================================
function sendLinePush(to, ten, noiDung, img, hinhThucXN, rIdx, tagId, soLan, uuTien, extraData) {
  var msgs = [];
  
  // 1. Xử lý Ảnh
  var cleanImg = String(img).trim();
  if (cleanImg !== "" && cleanImg.startsWith("http")) {
    msgs.push({"type": "image", "originalContentUrl": cleanImg, "previewImageUrl": cleanImg});
  }
  
  // 2. Xử lý Tag đích danh (Sử dụng tin nhắn textV2 với substitution hỗ trợ đa thành viên)
  var alertTxt = "";
  if (noiDung.indexOf("SẮP ĐẾN HẠN") !== -1) {
    alertTxt = "⏰ Sắp đến hạn: " + ten;
  } else if (noiDung.indexOf("CẢNH BÁO QUÁ HẠN") !== -1) {
    alertTxt = "🚨 QUÁ HẠN / CẦN QUẢN LÝ THEO DÕI: " + ten;
  } else if (soLan >= 3) {
    alertTxt = "🚨 QUÁ HẠN / CẦN QUẢN LÝ THEO DÕI: Công việc '" + ten + "' chưa hoàn thành!";
  } else if (soLan === 2) {
    alertTxt = "🔔 Nhắc lại: Công việc '" + ten + "' chưa hoàn thành!";
  } else {
    alertTxt = "🔔 Bạn có công việc mới: " + ten;
  }

  var cleanTagId = String(tagId || "").trim();
  if (soLan >= 3 && extraData && extraData.nguoiTheoDoi) {
    var followers = String(extraData.nguoiTheoDoi).trim();
    if (followers !== "") {
      cleanTagId = cleanTagId ? cleanTagId + "," + followers : followers;
    }
  }

  var cleanTagIds = cleanTagId.split(",").map(function(s) { return s.trim(); }).filter(function(id) {
    return /^U[a-fA-F0-9]{32}$/.test(id);
  });

  if (cleanTagIds.length > 0) {
    var textParts = [];
    var substitution = {};
    cleanTagIds.forEach(function(id, idx) {
      var key = "m_" + (idx + 1);
      textParts.push("{" + key + "}");
      substitution[key] = {
        "type": "mention",
        "mentionee": {
          "type": "user",
          "userId": id
        }
      };
    });
    msgs.push({
      "type": "textV2",
      "text": textParts.join(" ") + " " + alertTxt,
      "substitution": substitution
    });
  } else {
    msgs.push({ "type": "text", "text": alertTxt });
  }

  // 3. Xử lý Thẻ Công việc (Flex Message nâng cấp)
  msgs.push(buildTaskFlexMessage(ten, noiDung, hinhThucXN, rIdx, soLan, uuTien, extraData));
  
  var payload = { "to": to, "messages": msgs };
  callLineApi("message/push", {
    method: "post",
    headers: {
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  }, "Gửi tin nhắn việc mới (Push)");
}

function buildTaskFlexMessage(ten, noiDung, hinhThucXN, rIdx, soLan, uuTien, extraData) {
  var currentStatus = extraData ? String(extraData.trangThaiChiTiet || "").trim() : "";
  var isOverdue = currentStatus === "Quá hạn";
  var isSupport = currentStatus === "Cần hỗ trợ";
  
  var isUrgent = String(uuTien).trim() === "GẤP";
  var isImportant = String(uuTien).trim() === "Quan trọng";
  
  var colorTheme = "#1DB446"; // Mặc định Bình thường
  var badgeText = "NHẮC VIỆC";
  if (isOverdue) {
    colorTheme = "#C70039"; // Đỏ đậm
    badgeText = "QUÁ HẠN";
  } else if (isSupport) {
    colorTheme = "#7B61FF"; // Tím
    badgeText = "CẦN HỖ TRỢ";
  } else if (isUrgent) {
    colorTheme = "#FF334B"; // Đỏ
    badgeText = "GẤP";
  } else if (isImportant) {
    colorTheme = "#FF9900"; // Cam
    badgeText = "QUAN TRỌNG";
  }

  var titleText = String(ten || "Công việc mới").trim();
  var bodyText = String(noiDung || "Không có nội dung chi tiết").trim();

  var fields = [];
  
  // 1. Phụ trách
  var assignees = "";
  if (extraData && extraData.idNV) {
    assignees = resolveMemberNamesList(extraData.idNV);
  } else {
    assignees = "Chưa phân công";
  }
  fields.push({
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: "Phụ trách", size: "xs", color: "#888888", flex: 3 },
      { type: "text", text: assignees, size: "xs", color: "#333333", flex: 7, wrap: true, weight: "bold" }
    ]
  });

  // 2. Deadline
  if (extraData && extraData.deadline) {
    fields.push({
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "Deadline", size: "xs", color: "#888888", flex: 3 },
        { type: "text", text: formatDateTimeDisplay(extraData.deadline), size: "xs", color: "#C70039", flex: 7, wrap: true, weight: "bold" }
      ]
    });
  }

  // 3. Loại công việc
  if (extraData && extraData.loaiCV && extraData.loaiCV !== "Khác") {
    fields.push({
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "Loại CV", size: "xs", color: "#888888", flex: 3 },
        { type: "text", text: extraData.loaiCV, size: "xs", color: "#333333", flex: 7, wrap: true }
      ]
    });
  }

  // 4. Người giao việc
  if (extraData && extraData.nguoiGiao) {
    fields.push({
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "Người giao", size: "xs", color: "#888888", flex: 3 },
        { type: "text", text: resolveMemberName(extraData.nguoiGiao), size: "xs", color: "#333333", flex: 7, wrap: true }
      ]
    });
  }

  // 5. Người theo dõi
  if (extraData && extraData.nguoiTheoDoi) {
    var followersText = resolveMemberNamesList(extraData.nguoiTheoDoi);
    if (followersText !== "Không có") {
      fields.push({
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "Theo dõi", size: "xs", color: "#888888", flex: 3 },
          { type: "text", text: followersText, size: "xs", color: "#555555", flex: 7, wrap: true }
        ]
      });
    }
  }

  // 6. Xác nhận
  fields.push({
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: "Xác nhận", size: "xs", color: "#888888", flex: 3 },
      { type: "text", text: String(hinhThucXN || "Không"), size: "xs", color: "#333333", flex: 7, wrap: true }
    ]
  });

  // 7. Lần nhắc
  fields.push({
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: "Lần nhắc", size: "xs", color: "#888888", flex: 3 },
      { type: "text", text: String(soLan || 1), size: "xs", color: "#333333", flex: 7 }
    ]
  });

  // 8. Ghi chú thêm
  if (extraData && extraData.ghiChu) {
    fields.push({
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "Ghi chú", size: "xs", color: "#888888", flex: 3 },
        { type: "text", text: extraData.ghiChu, size: "xs", color: "#555555", flex: 7, wrap: true, style: "italic" }
      ]
    });
  }

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      backgroundColor: colorTheme,
      contents: [
        {
          type: "text",
          text: badgeText,
          size: "xs",
          color: "#FFFFFF",
          weight: "bold"
        },
        {
          type: "text",
          text: titleText,
          size: "md",
          color: "#FFFFFF",
          weight: "bold",
          wrap: true,
          margin: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "14px",
      contents: [
        {
          type: "text",
          text: bodyText,
          size: "sm",
          color: "#333333",
          wrap: true
        },
        {
          type: "separator",
          margin: "md"
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          margin: "md",
          contents: fields
        }
      ]
    }
  };

  var footerContents = [];

  // Primary Action Button (Hoàn tất, Gửi ảnh, Gửi ảnh + ghi chú)
  if (hinhThucXN === "Bấm nút" || hinhThucXN === "Có") {
    footerContents.push({
      type: "button",
      style: "primary",
      color: colorTheme,
      height: "sm",
      action: {
        type: "postback",
        label: "Hoàn tất",
        data: "action=hoantat&row=" + rIdx
      }
    });
  } else if (hinhThucXN === "Gửi ảnh") {
    footerContents.push({
      type: "button",
      style: "primary",
      color: "#FF9900",
      height: "sm",
      action: {
        type: "postback",
        label: "📸 Gửi ảnh nghiệm thu",
        data: "action=chupanh&row=" + rIdx
      }
    });
  } else if (hinhThucXN === "Gửi ảnh + ghi chú") {
    footerContents.push({
      type: "button",
      style: "primary",
      color: "#FF9900",
      height: "sm",
      action: {
        type: "postback",
        label: "📸 Gửi ảnh + ghi chú",
        data: "action=chupanh_ghichu&row=" + rIdx
      }
    });
  }

  // Row 2: "Dời 15 phút" and "Cần hỗ trợ"
  var subButtons = [];
  subButtons.push({
    type: "button",
    style: "secondary",
    color: "#4B5563",
    height: "sm",
    flex: 1,
    action: {
      type: "postback",
      label: "🕒 Dời 15 phút",
      data: "action=delay&mins=15&row=" + rIdx
    }
  });

  if (currentStatus !== "Cần hỗ trợ") {
    subButtons.push({
      type: "button",
      style: "secondary",
      color: "#7B61FF",
      height: "sm",
      flex: 1,
      action: {
        type: "postback",
        label: "🚨 Cần hỗ trợ",
        data: "action=support&row=" + rIdx
      }
    });
  }

  footerContents.push({
    type: "box",
    layout: "horizontal",
    margin: "sm",
    spacing: "sm",
    contents: subButtons
  });

  bubble.footer = {
    type: "box",
    layout: "vertical",
    paddingAll: "10px",
    contents: footerContents
  };

  return {
    type: "flex",
    altText: "Việc mới: " + titleText,
    contents: bubble
  };
}


function replyMessages(token, messages, logName) {
  if (!token) {
    writeLog("Không có replyToken, không thể reply.", "ERROR", "replyMessages");
    return;
  }

  var payload = {
    replyToken: token,
    messages: messages
  };

  callLineApi("message/reply", {
    method: "post",
    headers: {
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  }, logName || "LINE reply");
}

function sendLinePush_Simple(to, txt) {
  try {
    callLineApi("message/push", {
      method: "post",
      headers: {
        "Content-Type": "application/json"
      },
      payload: JSON.stringify({
        to: to,
        messages: [{"type": "text", "text": txt}]
      }),
      muteHttpExceptions: true
    }, "LINE push simple");
  } catch (e) {
    writeLog("Lỗi sendLinePush_Simple: " + e.toString(), "ERROR", "sendLinePush_Simple");
  }
}

function sendLineReply(token, txt) {
  replyMessages(token, [{ type: "text", text: String(txt || "") }], "LINE text reply");
}

function getUserName(uId, gId) {
  try {
    var url = gId ? "group/" + gId + "/member/" + uId : "profile/" + uId;
    var res = callLineApi(url, { method: "get" }, "Lấy tên thành viên");
    return JSON.parse(res.getContentText()).displayName;
  } catch (e) {
    writeLog("Lỗi lấy tên thành viên: " + e.toString(), "WARNING", "getUserName", { userId: uId, groupId: gId });
    return "Nhân viên";
  }
}

function resolveMemberName(uId, gId) {
  if (!uId) return "";
  uId = String(uId).trim();
  if (uId === "") return "";
  if (!/^U[a-fA-F0-9]{32}$/.test(uId)) {
    return uId;
  }
  try {
    var ss = getSpreadsheet();
    var sMem = ss.getSheetByName("ID_Member");
    if (sMem) {
      var memValues = sMem.getDataRange().getValues();
      for (var i = 1; i < memValues.length; i++) {
        if (String(memValues[i][1]).trim() === uId) {
          return memValues[i][0];
        }
      }
    }
  } catch (sheetErr) {
    writeLog("Error reading ID_Member in resolveMemberName: " + sheetErr.toString(), "WARN");
  }
  var name = getUserName(uId, gId);
  try {
    var ss = getSpreadsheet();
    var sMem = ss.getSheetByName("ID_Member");
    if (sMem) {
      sMem.appendRow([name, uId]);
    }
  } catch (cacheErr) {
    writeLog("Error caching ID_Member: " + cacheErr.toString(), "WARN");
  }
  return name;
}

function resolveMemberNamesList(idsStr, groupId) {
  if (!idsStr) return "Không có";
  var ids = String(idsStr).split(",").map(function(s) { return s.trim(); }).filter(Boolean);
  if (ids.length === 0) return "Không có";
  var names = ids.map(function(id) {
    return resolveMemberName(id, groupId);
  });
  return names.join(", ");
}

function formatDateTimeDisplay(dateOrStr) {
  if (!dateOrStr) return "Không có";
  var d = dateOrStr;
  if (typeof d === "string") {
    d = convertToDate(d);
  }
  if (!d || isNaN(d.getTime())) return String(dateOrStr);
  try {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
  } catch (e) {
    return String(dateOrStr);
  }
}

function capNhatTuongTac(gId, uId, name, type) {
  var s = getSpreadsheet().getSheetByName("Tương Tác"), today = new Date().toDateString();
  var d = s.getDataRange().getValues(), rIdx = -1;
  for (var i = 1; i < d.length; i++) { if (d[i][0] === today && d[i][1] === gId && d[i][2] === uId) { rIdx = i + 1; break; } }
  var v = (type === "text") ? 1 : 0, st = (type === "sticker") ? 1 : 0, im = (type === "image") ? 1 : 0;
  if (rIdx === -1) s.appendRow([today, gId, uId, name, v, st, im, 1]);
  else { var r = d[rIdx-1]; s.getRange(rIdx, 5, 1, 4).setValues([[r[4]+v, r[5]+st, r[6]+im, r[7]+1]]); }
}

function guiBaoCaoTuongTac(gId, token, days) {
  var s = getSpreadsheet().getSheetByName("Tương Tác"), d = s.getDataRange().getValues(), stats = {};
  var start = new Date().getTime() - (days - 1) * 24 * 60 * 60 * 1000;
  for (var i = 1; i < d.length; i++) { if (d[i][1] === gId && new Date(d[i][0]).getTime() >= start) { var id = d[i][2]; if (!stats[id]) stats[id] = { n: d[i][3], v: 0, s: 0, i: 0, t: 0 }; stats[id].v += d[i][4]; stats[id].s += d[i][5]; stats[id].i += d[i][6]; stats[id].t += d[i][7]; } }
  var arr = Object.keys(stats).map(k => stats[k]).sort((a,b) => b.t - a.t);
  if (arr.length === 0) { sendLineReply(token, "Chưa có dữ liệu."); return; }
  var rep = "📊 TƯƠNG TÁC (" + (days===1?"HÔM NAY":"TUẦN") + ")\nName | T | S | I | Tổng\n";
  arr.forEach(r => { rep += r.n.substring(0,8) + " | " + r.v + " | " + r.s + " | " + r.i + " | " + r.t + "\n"; });
  sendLineReply(token, rep);
}





function LAM_SACH_SU_KIEN() { 
  var ss = getSpreadsheet();
  var s = ss.getSheetByName("Sự kiện"); 
  if (!s) { SpreadsheetApp.getUi().alert("❌ Không tìm thấy sheet 'Sự kiện'"); return; }
  if (s.getLastRow() > 1) s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).clearContent(); 
  SpreadsheetApp.getUi().alert("✅ Đã làm sạch toàn bộ dữ liệu trong sheet Sự kiện!");
}

function LAM_SACH_TUONG_TAC() { 
  var ss = getSpreadsheet();
  var s = ss.getSheetByName("Tương Tác") || ss.getSheetByName("Tương tác") || ss.getSheetByName("TuongTac"); 
  if (!s) { SpreadsheetApp.getUi().alert("❌ Không tìm thấy sheet 'Tương Tác'!"); return; }
  if (s.getLastRow() > 1) s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).clearContent(); 
  SpreadsheetApp.getUi().alert("✅ Đã làm sạch toàn bộ dữ liệu trong sheet Tương tác!");
}

function XOA_DONG_RÁC() { 
  var ss = getSpreadsheet();
  var s = ss.getSheetByName("Sự kiện"); 
  if (!s) return;
  var maxRows = s.getMaxRows();
  if (maxRows <= 1) { SpreadsheetApp.getUi().alert("🧹 Sheet Sự kiện sạch sẽ!"); return; }
  var d = s.getRange(1, 1, maxRows, 1).getValues(); 
  var count = 0; var numEmpty = 0;
  for (var i = maxRows - 1; i >= 1; i--) { 
    if (String(d[i][0]).trim() === "") { numEmpty++; } 
    else { if (numEmpty > 0) { s.deleteRows(i + 2, numEmpty); count += numEmpty; numEmpty = 0; } }
  }
  if (numEmpty > 0) { s.deleteRows(2, numEmpty); count += numEmpty; }
  if (count > 0) { s.insertRowAfter(s.getMaxRows()); SpreadsheetApp.getUi().alert("⚡ Đã dọn dẹp SIÊU TỐC " + count + " dòng rác!"); } 
  else { SpreadsheetApp.getUi().alert("🧹 Sheet Sự kiện đã sạch sẽ!"); }
}

// ==========================================
// TÍNH NĂNG LIFF: WEB APP GIAO VIỆC
// ==========================================
function doGet(e) {
  // Bỏ qua iframe sandbox, nếu gọi API lấy danh sách
  if (e && e.parameter && e.parameter.action === "getLists") {
    var data = getFormDataLists();
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
  }
  
  var template = HtmlService.createTemplateFromFile('liff');
  // Truyền URL Web App động vào template
  try {
    template.webAppUrl = ScriptApp.getService().getUrl();
  } catch(err) {
    template.webAppUrl = "";
  }
  
  return template.evaluate()
      .setTitle('📝 Giao Việc Nhanh - LINE BOT')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    // Tự động lưu trữ ID Spreadsheet khi có context
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    return ss;
  }
  
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (ssId) {
    try {
      return SpreadsheetApp.openById(ssId);
    } catch(e) {}
  }
  
  throw new Error("Không thể kết nối với Spreadsheet. Vui lòng mở Google Sheet và bấm chạy Menu '1. Khởi tạo Bảng Dữ Liệu' trước.");
}

function getFormDataLists() {
  var ss = getSpreadsheet();
  
  // Lấy danh sách nhóm
  var sGroup = ss.getSheetByName("ID_Group");
  var groups = [];
  if (sGroup && sGroup.getLastRow() > 1) {
    var gData = sGroup.getRange(2, 1, sGroup.getLastRow() - 1, 2).getValues();
    gData.forEach(function(row) {
      if (String(row[0]).trim() !== "") {
        groups.push({ name: row[0], id: row[1] });
      }
    });
  }
  
  // Lấy danh sách thành viên
  var sMember = ss.getSheetByName("ID_Member");
  var members = [];
  if (sMember && sMember.getLastRow() > 1) {
    var mData = sMember.getRange(2, 1, sMember.getLastRow() - 1, 2).getValues();
    mData.forEach(function(row) {
      if (String(row[0]).trim() !== "") {
        members.push({ name: row[0], id: row[1] });
      }
    });
  }
  
  return { groups: groups, members: members };
}

function createTaskFromLIFF(data) {
  try {
    var ss = getSpreadsheet();
    var sheetEvent = ss.getSheetByName("Sự kiện");
    if (!sheetEvent) return { success: false, message: "Không tìm thấy sheet 'Sự kiện'!" };
    
    var ten = String(data.ten || "").trim();
    var nd = String(data.noiDung || "").trim();
    var tgStr = String(data.ngayGio || "").trim();
    var la = String(data.linkAnh || "").trim();
    var ll = String(data.lapLai || "Không").trim();
    var idG = String(data.idGroup || "").trim();
    var idNV = String(data.idMember || "").trim(); // Comma-separated list of assignee IDs
    var ts = parseInt(data.tanSuat, 10) || 15;
    var ht = String(data.hinhThucXN || "Không").trim(); // Form verification requirement
    var ut = String(data.doUuTien || "Bình thường").trim(); // Priority
    
    // New fields
    var deadlineStr = String(data.deadline || "").trim();
    var loaiCV = String(data.loaiCV || "Khác").trim();
    var nguoiGiao = String(data.idAssigner || "").trim();
    var nguoiTheoDoi = String(data.idFollower || "").trim();
    var ghiChu = String(data.ghiChu || "").trim();

    var employeeName = "Unassigned";
    if (idNV) {
      var firstId = idNV.split(",")[0].trim();
      employeeName = getUserName(firstId, idG) || "Staff";
    } else if (nguoiGiao) {
      employeeName = getUserName(nguoiGiao, idG) || "Staff";
    }

    if (data.imageFiles && data.imageFiles.length > 0) {
      var links = [];
      for (var i = 0; i < data.imageFiles.length; i++) {
        var imgLink = saveLiffImageToDrive(data.imageFiles[i], ten, employeeName, i + 1);
        if (imgLink) {
          links.push(imgLink);
        }
      }
      if (links.length > 0) {
        la = links.join("\n");
      }
    } else if (data.imageFile && data.imageFile.dataUrl) {
      la = saveLiffImageToDrive(data.imageFile, ten, employeeName, 1);
    }
    
    if (nguoiGiao && !canCreateTask(nguoiGiao, idG)) {
      writeLog("Lỗi phân quyền LIFF: User không có quyền giao việc", "ERROR", "createTaskFromLIFF", { action: "createTask", userId: nguoiGiao, groupId: idG });
      return { success: false, message: "Bạn không có quyền giao việc trong nhóm này!" };
    }
    
    if (ten === "") {
      writeLog("Lỗi xác thực LIFF: Tên sự kiện rỗng", "ERROR", "createTaskFromLIFF", { action: "createTask", missing: "ten", userId: nguoiGiao });
      return { success: false, message: "Tên sự kiện không được để trống!" };
    }
    if (idG === "") {
      writeLog("Lỗi xác thực LIFF: Nhóm nhận rỗng", "ERROR", "createTaskFromLIFF", { action: "createTask", missing: "idGroup", userId: nguoiGiao });
      return { success: false, message: "Vui lòng chọn Nhóm nhận!" };
    }
    if (tgStr === "") {
      writeLog("Lỗi xác thực LIFF: Ngày giờ gửi rỗng", "ERROR", "createTaskFromLIFF", { action: "createTask", missing: "ngayGio", userId: nguoiGiao });
      return { success: false, message: "Vui lòng chọn Ngày giờ gửi!" };
    }
    
    var dateVal = convertToDate(tgStr);
    if (!dateVal) {
      writeLog("Lỗi xác thực LIFF: Ngày giờ gửi không hợp lệ", "ERROR", "createTaskFromLIFF", { action: "createTask", invalid: "ngayGio", value: tgStr, userId: nguoiGiao });
      return { success: false, message: "Ngày giờ gửi không hợp lệ!" };
    }
    
    var deadlineVal = deadlineStr ? convertToDate(deadlineStr) : dateVal;
    if (!deadlineVal) deadlineVal = dateVal;
    
    // Set performer global context
    globalCurrentUserName = getUserName(nguoiGiao, idG);
    
    // Generate Task ID
    var newTaskId = generateTaskId(dateVal);
    
    // Ghi dữ liệu vào sheet Sự kiện (24 columns)
    var rowData = [
      newTaskId,    // 1. Task ID
      ten,          // 2. Tên sự kiện
      nd,           // 3. Nội dung
      dateVal,      // 4. Ngày giờ gửi
      la,           // 5. Link ảnh đính kèm
      ll,           // 6. Lặp lại
      idG,          // 7. Nhóm nhận
      idNV,         // 8. Người phụ trách
      ts,           // 9. Tần suất (phút)
      ht,           // 10. Hình thức xác nhận
      ut,           // 11. Độ ưu tiên
      "",           // 12. Người xác nhận
      "",           // 13. Trạng thái
      "",           // 14. Lần nhắc cuối
      "",           // 15. Số lần nhắc
      "",           // 16. Link Ảnh Nghiệm Thu
      deadlineVal,  // 17. Deadline
      loaiCV,       // 18. Loại công việc
      nguoiGiao,    // 19. Người giao việc
      nguoiTheoDoi, // 20. Người theo dõi
      ghiChu,       // 21. Ghi chú
      "",           // 22. Trạng thái xử lý chi tiết
      "",           // 23. Lịch sử cập nhật
      ""            // 24. Đã nhắc trước deadline
    ];
    ghiDuLieuThongMinh(sheetEvent, rowData);
    
    // Log creation
    appendTaskLog(newTaskId, "Tạo việc mới", "", "Chờ xác nhận", "Tạo từ LIFF Form bởi " + globalCurrentUserName);
    
    // Gửi ngay nếu công việc đã tới giờ, không cần chờ trigger 1 phút.
    checkAndSendLineMessage();
    
    return { success: true, message: "Đã tạo công việc và đã kiểm tra gửi LINE!" };
  } catch (e) {
    return { success: false, message: "Lỗi hệ thống: " + e.toString() };
  }
}

function OPEN_LIFF_FORM() {
  var url = getLiffUrl();
  var html = HtmlService.createHtmlOutput('<script>window.open("' + url + '", "_blank");google.script.host.close();</script>').setWidth(300).setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(html, "🚀 Đang mở Form LIFF...");
}

// ==========================================
// HÀM HỖ TRỢ GHI LOG & PHÂN TÍCH NGÀY THÁNG MỚI (CHUẨN HÓA)
// ==========================================

function writeLog(message, type, functionName, payload) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Logs");
    if (!sheet) {
      sheet = ss.insertSheet("Logs");
      sheet.appendRow(["Thời gian", "Loại", "Hàm", "Nội dung", "Payload rút gọn"]);
      sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#d9ead3");
      sheet.setFrozenRows(1);
    } else {
      var lastCol = sheet.getLastColumn();
      if (lastCol < 5) {
        sheet.getRange(1, 1, 1, 5).setValues([["Thời gian", "Loại", "Hàm", "Nội dung", "Payload rút gọn"]]);
        sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#d9ead3");
      }
    }
    
    type = type || "INFO";
    functionName = functionName || "";
    var payloadStr = "";
    if (payload) {
      if (typeof payload === "object") {
        try {
          payloadStr = JSON.stringify(payload);
          if (payloadStr.length > 500) {
            payloadStr = payloadStr.substring(0, 500) + "... (rút gọn)";
          }
        } catch (e) {
          payloadStr = String(payload);
        }
      } else {
        payloadStr = String(payload);
      }
    }
    
    var timeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([timeStr, type, functionName, message, payloadStr]);
    
    var maxLogs = 2000;
    var lastRow = sheet.getLastRow();
    if (lastRow > maxLogs + 1) {
      sheet.deleteRows(2, lastRow - (maxLogs + 1));
    }
  } catch (e) {
    Logger.log("Lỗi ghi log: " + e.toString());
  }
}

function callLineApi(endpoint, options, actionDescription) {
  var url = endpoint.startsWith("http") ? endpoint : "https://api.line.me/v2/bot/" + endpoint;
  
  if (!options) options = {};
  if (!options.headers) options.headers = {};
  
  var token = getToken();
  options.headers["Authorization"] = "Bearer " + token;
  
  var maxRetries = 2;
  var attempt = 0;
  var res;
  var code;
  var body;
  
  while (attempt <= maxRetries) {
    try {
      res = UrlFetchApp.fetch(url, options);
      code = res.getResponseCode();
      body = res.getContentText();
      
      writeLog(
        "Gọi LINE API: " + actionDescription + " | HTTP " + code,
        code >= 200 && code < 300 ? "INFO" : "ERROR",
        "callLineApi",
        {
          endpoint: endpoint,
          responseCode: code,
          responseBody: body,
          attempt: attempt + 1
        }
      );
      
      if (code >= 200 && code < 300) {
        return res;
      }
      
      if ([429, 500, 502, 503, 504].indexOf(code) !== -1) {
        attempt++;
        if (attempt <= maxRetries) {
          Utilities.sleep(1000 * attempt);
          continue;
        }
      } else {
        break; // Lỗi 400/401/403... không retry
      }
    } catch (err) {
      writeLog(
        "Lỗi ngoại lệ gọi LINE API: " + actionDescription + " | " + err.toString(),
        "ERROR",
        "callLineApi",
        { endpoint: endpoint, error: err.toString(), attempt: attempt + 1 }
      );
      
      attempt++;
      if (attempt <= maxRetries) {
        Utilities.sleep(1000 * attempt);
        continue;
      }
      throw err;
    }
  }
  
  if (code < 200 || code >= 300) {
    throw new Error("LINE API error HTTP " + code + ": " + body);
  }
  
  return res;
}

function convertToDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    if (!isNaN(dateVal.getTime())) return dateVal;
    return null;
  }
  
  var str = String(dateVal).trim();
  if (str === "") return null;
  
  // 1. Thử phân tích chuẩn bằng Date API
  var d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  
  // 2. Thử phân tích định dạng dd/mm/yyyy hh:mm:ss hoặc tương tự
  var matchDMY = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (matchDMY) {
    var day = parseInt(matchDMY[1], 10);
    var month = parseInt(matchDMY[2], 10) - 1; // 0-indexed month
    var year = parseInt(matchDMY[3], 10);
    var hour = matchDMY[4] ? parseInt(matchDMY[4], 10) : 0;
    var minute = matchDMY[5] ? parseInt(matchDMY[5], 10) : 0;
    var second = matchDMY[6] ? parseInt(matchDMY[6], 10) : 0;
    var parsed = new Date(year, month, day, hour, minute, second);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  // 3. Thử phân tích định dạng yyyy-mm-dd hh:mm:ss
  var matchYMD = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (matchYMD) {
    var year = parseInt(matchYMD[1], 10);
    var month = parseInt(matchYMD[2], 10) - 1;
    var day = parseInt(matchYMD[3], 10);
    var hour = matchYMD[4] ? parseInt(matchYMD[4], 10) : 0;
    var minute = matchYMD[5] ? parseInt(matchYMD[5], 10) : 0;
    var second = matchYMD[6] ? parseInt(matchYMD[6], 10) : 0;
    var parsed = new Date(year, month, day, hour, minute, second);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  return null;
}

function CHAY_QUET_VIEC_THU_CONG() {
  writeLog("=== BẮT ĐẦU CHẠY THỦ CÔNG ===", "INFO");
  checkAndSendLineMessage();
  writeLog("=== KẾT THÚC CHẠY THỦ CÔNG ===", "INFO");
  
  var ui = SpreadsheetApp.getUi();
  ui.alert("✅ Đã chạy quét việc xong! Vui lòng kiểm tra sheet 'Logs' để xem chi tiết kết quả.");
}

// ==========================================
// HÀM HỖ TRỢ HƯỚNG DẪN & CHAT RIÊNG
// ==========================================
function replyHelp(token) {
  var flexMsg = buildHelpFlexMessage();
  replyMessages(token, [flexMsg], "LINE help flex reply");
}

function buildGiaoFormFlexMessage() {
  var bubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1DB446",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "📝 GIAO VIỆC NHANH",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "14px",
      contents: [
        {
          type: "text",
          text: "Bấm nút dưới để mở form giao việc và phân công công việc cho thành viên.",
          size: "xs",
          color: "#333333",
          wrap: true
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#1DB446",
          height: "sm",
          action: {
            type: "uri",
            label: "Mở Form",
            uri: getLiffUrl()
          }
        }
      ]
    }
  };
  return {
    type: "flex",
    altText: "Mở Form Giao Việc",
    contents: bubble
  };
}

function replyGiaoForm(token) {
  var flexMsg = buildGiaoFormFlexMessage();
  flexMsg.quickReply = {
    items: [
      {
        type: "action",
        action: {
          type: "uri",
          label: "Mở form",
          uri: getLiffUrl()
        }
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "Trợ giúp",
          text: "/help"
        }
      }
    ]
  };
  replyMessages(token, [flexMsg], "LINE giao form flex reply");
}


// ==========================================
// HÀM BỎ DẤU TIẾNG VIỆT & CHUẨN HÓA TÊN FILE
// ==========================================
function removeVietnameseTones(str) {
  if (!str) return "";
  str = String(str);
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
  str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
  str = str.replace(/đ/g,"d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  str = str.replace(/\u0300|\u0301|\u0309|\u0303|\u0309/g, "");
  str = str.replace(/\u02c6|\u0306|\u031b/g, "");
  str = str.replace(/[^a-zA-Z0-9\s_-]/g, "");
  str = str.replace(/\s+/g, "_");
  return str;
}

// ==========================================
// HÀM LƯU ẢNH BASE64 TỪ LIFF VÀO GOOGLE DRIVE
// ==========================================
function saveLiffImageToDrive(imageFile, taskName, employeeName, index) {
  if (!imageFile || !imageFile.dataUrl) return "";

  var now = new Date();
  var yearMonth = Utilities.formatDate(now, Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "yyyy-MM");
  
  var parentFolderName = "BOT - LINE";
  var parentFolders = DriveApp.getFoldersByName(parentFolderName);
  var parentFolder = parentFolders.hasNext() ? parentFolders.next() : DriveApp.createFolder(parentFolderName);
  parentFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  var subFolders = parentFolder.getFoldersByName(yearMonth);
  var folder = subFolders.hasNext() ? subFolders.next() : parentFolder.createFolder(yearMonth);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var contentType = imageFile.type || imageFile.dataUrl.substring(5, imageFile.dataUrl.indexOf(';'));
  var base64 = imageFile.dataUrl.split(',')[1];
  var bytes = Utilities.base64Decode(base64);

  // Filename format: YYYYMMDD_HHMM_TenNhanVien_TenViec_XX.jpg
  var ymd_hm = Utilities.formatDate(now, Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "yyyyMMdd_HHmm");
  var safeEmp = removeVietnameseTones(employeeName || "Staff");
  var safeTask = removeVietnameseTones(taskName || "Task");
  var idxStr = ("0" + (index || 1)).slice(-2);
  
  var safeName = ymd_hm + "_" + safeEmp + "_" + safeTask + "_" + idxStr + ".jpg";

  var blob = Utilities.newBlob(bytes, contentType, safeName);
  var file = folder.createFile(blob);
  var fileId = file.getId();

  var directLink = "https://lh3.googleusercontent.com/d/" + fileId;

  var sheet = getSpreadsheet().getSheetByName("Link_img");
  if (sheet) sheet.appendRow([safeName, directLink]);

  return directLink;
}

// ==========================================
// HÀM TẠO VÀ CẤU HÌNH RICH MENU
// ==========================================
function SETUP_RICH_MENU() {
  var url = "https://api.line.me/v2/bot/richmenu";

  var payload = {
    size: {
      width: 2500,
      height: 1686
    },
    selected: true,
    name: "BOT NHAC VIEC",
    chatBarText: "Menu",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: {
          type: "uri",
          label: "Giao việc",
          uri: getLiffUrl()
        }
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: {
          type: "message",
          label: "Hôm nay",
          text: "/tthomnay"
        }
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: {
          type: "message",
          label: "7 ngày",
          text: "/tt7ngay"
        }
      },
      {
        bounds: { x: 0, y: 843, width: 833, height: 843 },
        action: {
          type: "message",
          label: "Lấy ID",
          text: "/id"
        }
      },
      {
        bounds: { x: 833, y: 843, width: 834, height: 843 },
        action: {
          type: "message",
          label: "Hướng dẫn",
          text: "/hd"
        }
      },
      {
        bounds: { x: 1667, y: 843, width: 833, height: 843 },
        action: {
          type: "message",
          label: "Trợ giúp",
          text: "/help"
        }
      }
    ]
  };

  var res = callLineApi("richmenu", {
    method: "post",
    headers: {
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  }, "Tạo Rich Menu");

  var body = res.getContentText();
  var data = JSON.parse(body);
  PropertiesService.getScriptProperties().setProperty("RICH_MENU_ID", data.richMenuId);

  try {
    SpreadsheetApp.getUi().alert("✅ Đã tạo Rich Menu thành công!\nID: " + data.richMenuId);
  } catch (e) {
    // Headless execution, ignore
  }
}

function UPLOAD_RICH_MENU_IMAGE_FROM_DRIVE() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var richMenuId = props.getProperty("RICH_MENU_ID");

  if (!richMenuId) {
    ui.alert("❌ Chưa có RICH_MENU_ID. Vui lòng bấm Tạo Rich Menu trước.");
    return;
  }

  var input = ui.prompt(
    "Upload ảnh Rich Menu",
    "Dán Google Drive File ID hoặc link ảnh Google Drive:",
    ui.ButtonSet.OK_CANCEL
  );

  if (input.getSelectedButton() !== ui.Button.OK) return;

  var raw = input.getResponseText().trim();
  if (!raw) {
    ui.alert("❌ Bạn chưa nhập link hoặc File ID ảnh.");
    return;
  }

  var fileId = raw;

  var match = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    fileId = match[1];
  } else {
    var matchId = raw.match(/id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) {
      fileId = matchId[1];
    }
  }

  try {
    var file = DriveApp.getFileById(fileId);
    var sizeBytes = file.getSize();
    if (sizeBytes > 1024 * 1024) {
      var confirm = ui.alert(
        "⚠️ Cảnh báo dung lượng",
        "Ảnh Rich Menu có dung lượng lớn hơn 1MB (" + (sizeBytes / (1024 * 1024)).toFixed(2) + " MB). LINE giới hạn ảnh Rich Menu tối đa 1MB, nếu upload có thể gây lỗi. Bạn có chắc chắn muốn tiếp tục?",
        ui.ButtonSet.YES_NO
      );
      if (confirm !== ui.Button.YES) {
        return;
      }
    }
    var blob = file.getBlob();
    var contentType = blob.getContentType();

    if (contentType !== "image/png" && contentType !== "image/jpeg") {
      ui.alert("❌ Ảnh phải là PNG hoặc JPG/JPEG.\nLoại hiện tại: " + contentType);
      return;
    }

    var url = "https://api-data.line.me/v2/bot/richmenu/" + richMenuId + "/content";

    var res = callLineApi("https://api-data.line.me/v2/bot/richmenu/" + richMenuId + "/content", {
      method: "post",
      headers: {
        "Content-Type": contentType
      },
      payload: blob.getBytes(),
      muteHttpExceptions: true
    }, "Upload ảnh Rich Menu");

    ui.alert("✅ Đã upload ảnh Rich Menu thành công.\nBấm tiếp: Đặt Rich Menu mặc định.");
  } catch (e) {
    ui.alert("❌ Không tìm thấy hoặc không đọc được ảnh trên Google Drive:\n" + e.toString());
  }
}

function SET_DEFAULT_RICH_MENU() {
  var richMenuId = PropertiesService.getScriptProperties().getProperty("RICH_MENU_ID");
  if (!richMenuId) throw new Error("Chưa có RICH_MENU_ID.");

  callLineApi("user/all/richmenu/" + richMenuId, {
    method: "post",
    muteHttpExceptions: true
  }, "Đặt Rich Menu mặc định");

  try {
    SpreadsheetApp.getUi().alert("✅ Đã đặt Rich Menu mặc định cho bot.");
  } catch (e) {
    // Headless execution
  }
}

function replyHuongDanBot(token) {
  var flexMsg = buildHdFlexMessage();
  replyMessages(token, [flexMsg], "LINE guide flex reply");
}


// ==========================================
// TEST NHANH LINK LIFF TRONG APPS SCRIPT
// ==========================================
function TEST_LIFF_URL() {
  SpreadsheetApp.getUi().alert(
    "LIFF URL hiện tại:\n" + getLiffUrl() +
    "\n\nNếu bấm trong LINE báo 'Lỗi hệ thống', hãy kiểm tra trong LINE Developers:" +
    "\n1. LIFF ID có đúng không" +
    "\n2. Endpoint URL của LIFF có đúng Web App URL đang deploy không" +
    "\n3. Web App đã deploy New version chưa" +
    "\n4. Execute as: Me, Who has access: Anyone"
  );
}

// ==========================================
// TÍNH NĂNG FLEX MESSAGE NÂNG CẤP & LỆNH TRA CỨU
// ==========================================

function getActiveTasksList() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Sự kiện");
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  
  var expectedHeaders = ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"];
  var actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  
  var mappedData = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var newRow = [];
    for (var j = 0; j < expectedHeaders.length; j++) {
      var hName = expectedHeaders[j];
      var idx = actualHeaders.indexOf(hName);
      if (idx !== -1 && idx < row.length) {
        newRow.push(row[idx]);
      } else {
        newRow.push("");
      }
    }
    mappedData.push(newRow);
  }
  return mappedData;
}

function buildHelpFlexMessage() {
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1DB446",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "🤖 TRỢ GIÚP TRA CỨU",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "14px",
      contents: [
        {
          type: "text",
          text: "Gửi các cú pháp sau vào khung chat để thực hiện:",
          size: "xs",
          color: "#666666"
        },
        {
          type: "separator"
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "📝 /gv", weight: "bold", size: "xs", color: "#1DB446", flex: 3 },
                { type: "text", text: "Mở form giao việc LIFF", size: "xs", color: "#333333", flex: 7 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "👤 /vieccuatoi", weight: "bold", size: "xs", color: "#1DB446", flex: 3 },
                { type: "text", text: "Xem việc chưa xong của tôi", size: "xs", color: "#333333", flex: 7 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "📂 /chuaxong", weight: "bold", size: "xs", color: "#1DB446", flex: 3 },
                { type: "text", text: "Danh sách việc chưa hoàn thành", size: "xs", color: "#333333", flex: 7 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "⚠️ /trehan", weight: "bold", size: "xs", color: "#1DB446", flex: 3 },
                { type: "text", text: "Danh sách việc quá hạn", size: "xs", color: "#333333", flex: 7 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "📊 /baocao", weight: "bold", size: "xs", color: "#1DB446", flex: 3 },
                { type: "text", text: "Xem báo cáo tiến độ hôm nay", size: "xs", color: "#333333", flex: 7 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "📖 /hd", weight: "bold", size: "xs", color: "#1DB446", flex: 3 },
                { type: "text", text: "Xem hướng dẫn chi tiết", size: "xs", color: "#333333", flex: 7 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🆔 /id", weight: "bold", size: "xs", color: "#1DB446", flex: 3 },
                { type: "text", text: "Lấy Group ID / User ID", size: "xs", color: "#333333", flex: 7 }
              ]
            }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      paddingAll: "10px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#1DB446",
          height: "sm",
          action: {
            type: "uri",
            label: "Giao Việc",
            uri: getLiffUrl()
          }
        },
        {
          type: "button",
          style: "secondary",
          color: "#4B5563",
          height: "sm",
          action: {
            type: "message",
            label: "Việc Của Tôi",
            text: "/vieccuatoi"
          }
        }
      ]
    }
  };
  return {
    type: "flex",
    altText: "Trợ giúp bot nhắc việc",
    contents: bubble
  };
}

function buildHdFlexMessage() {
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1DB446",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "📖 HƯỚNG DẪN SỬ DỤNG BOT NHẮC VIỆC",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "14px",
      contents: [
        {
          type: "text",
          text: "Bot giúp giao việc, nhắc việc và tự động báo cáo tiến độ qua LINE.",
          size: "xs",
          color: "#333333",
          wrap: true
        },
        {
          type: "separator"
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            { type: "text", text: "1. Giao việc nhanh", weight: "bold", size: "xs", color: "#1DB446" },
            { type: "text", text: "Dùng nút 'Giao Việc' hoặc gửi /gv để mở form điền thông tin người phụ trách, hạn hoàn thành (Deadline) và hình thức xác nhận.", size: "xs", color: "#555555", wrap: true },
            { type: "text", text: "2. Nhắc việc & Leo thang", weight: "bold", size: "xs", color: "#1DB446", margin: "sm" },
            { type: "text", text: "Bot tự động nhắc nhở người phụ trách theo tần suất cấu hình. Nếu nhắc >= 3 lần mà chưa xong, bot sẽ tag thêm cả người theo dõi để theo dõi sát sao.", size: "xs", color: "#555555", wrap: true },
            { type: "text", text: "3. Nghiệm thu & Tương tác", weight: "bold", size: "xs", color: "#1DB446", margin: "sm" },
            { type: "text", text: "Người phụ trách bấm Hoàn tất hoặc tải ảnh nghiệm thu lên để hoàn tất. Bot tự động lưu giữ lịch sử thực hiện của bạn.", size: "xs", color: "#555555", wrap: true }
          ]
        }
      ]
    }
  };
  return {
    type: "flex",
    altText: "Hướng dẫn sử dụng bot",
    contents: bubble
  };
}

function buildMyTasksFlexMessage(uId, uName, gId) {
  var tasks = getActiveTasksList();
  var myTasks = [];
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    var rowIndex = i + 2;
    var status = String(row[11] || "").trim();
    if (status === "Đã gửi" || status === "Đã hủy") continue;
    
    var idG = String(row[5] || "").trim();
    if (gId && idG !== gId) continue;
    
    var idNV = String(row[6] || "").trim();
    var assignees = idNV.split(",").map(function(s) { return s.trim(); });
    
    if (assignees.indexOf(uId) !== -1) {
      myTasks.push({
        rowIndex: rowIndex,
        name: row[0],
        deadline: row[15],
        status: status,
        priority: row[9]
      });
    }
  }
  
  var contents = [];
  if (myTasks.length === 0) {
    contents.push({
      type: "text",
      text: "🎉 Tuyệt vời! Bạn không có công việc nào chưa hoàn thành.",
      size: "xs",
      color: "#666666",
      wrap: true
    });
  } else {
    myTasks.forEach(function(task, idx) {
      if (idx > 0) contents.push({ type: "separator", margin: "sm" });
      
      var statusColor = "#1DB446";
      if (task.status === "Quá hạn") statusColor = "#C70039";
      else if (task.status === "Cần hỗ trợ") statusColor = "#7B61FF";
      else if (task.status === "Đang làm") statusColor = "#3B82F6";
      else statusColor = "#F59E0B";
      
      contents.push({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        margin: "sm",
        contents: [
          {
            type: "text",
            text: "• " + task.name,
            size: "xs",
            color: "#333333",
            weight: "bold",
            flex: 5,
            wrap: true
          },
          {
            type: "text",
            text: task.status,
            size: "xxs",
            color: statusColor,
            weight: "bold",
            flex: 2,
            align: "end"
          },
          {
            type: "text",
            text: task.deadline ? formatDateTimeDisplay(task.deadline).split(" ")[1] : "N/A",
            size: "xs",
            color: "#888888",
            flex: 2,
            align: "end"
          }
        ]
      });
    });
  }
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3B82F6",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "👤 VIỆC CHƯA XONG CỦA: " + uName.toUpperCase(),
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "14px",
      contents: contents
    }
  };
  
  return {
    type: "flex",
    altText: "Việc chưa xong của tôi",
    contents: bubble
  };
}

function buildChuaXongFlexMessage(gId) {
  var tasks = getActiveTasksList();
  var pendingTasks = [];
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    var status = String(row[11] || "").trim();
    if (status === "Đã gửi" || status === "Đã hủy") continue;
    
    var idG = String(row[5] || "").trim();
    if (gId && idG !== gId) continue;
    
    pendingTasks.push({
      name: row[0],
      assignee: resolveMemberNamesList(row[6]),
      deadline: row[15],
      status: status
    });
  }
  
  var contents = [];
  if (pendingTasks.length === 0) {
    contents.push({
      type: "text",
      text: "🎉 Tất cả công việc trong nhóm đã hoàn thành!",
      size: "xs",
      color: "#666666",
      wrap: true
    });
  } else {
    pendingTasks.forEach(function(task, idx) {
      if (idx > 0) contents.push({ type: "separator", margin: "sm" });
      
      var statusColor = "#1DB446";
      if (task.status === "Quá hạn") statusColor = "#C70039";
      else if (task.status === "Cần hỗ trợ") statusColor = "#7B61FF";
      else if (task.status === "Đang làm") statusColor = "#3B82F6";
      else statusColor = "#F59E0B";
      
      contents.push({
        type: "box",
        layout: "vertical",
        margin: "sm",
        spacing: "xs",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "• " + task.name,
                size: "xs",
                color: "#333333",
                weight: "bold",
                flex: 7,
                wrap: true
              },
              {
                type: "text",
                text: task.status,
                size: "xxs",
                color: statusColor,
                weight: "bold",
                flex: 3,
                align: "end"
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "👤: " + task.assignee,
                size: "xxs",
                color: "#666666",
                flex: 6,
                wrap: true
              },
              {
                type: "text",
                text: "⏰: " + (task.deadline ? formatDateTimeDisplay(task.deadline) : "N/A"),
                size: "xxs",
                color: "#888888",
                flex: 4,
                align: "end"
              }
            ]
          }
        ]
      });
    });
  }
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#F59E0B",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "📂 TOÀN BỘ CÔNG VIỆC CHƯA XONG",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "14px",
      contents: contents
    }
  };
  
  return {
    type: "flex",
    altText: "Danh sách công việc chưa xong",
    contents: bubble
  };
}

function buildTreHanFlexMessage(gId) {
  var tasks = getActiveTasksList();
  var overdueTasks = [];
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    var status = String(row[11] || "").trim();
    if (status === "Quá hạn") {
      var idG = String(row[5] || "").trim();
      if (gId && idG !== gId) continue;
      
      overdueTasks.push({
        name: row[0],
        assignee: resolveMemberNamesList(row[6]),
        deadline: row[15]
      });
    }
  }
  
  var contents = [];
  if (overdueTasks.length === 0) {
    contents.push({
      type: "text",
      text: "✅ Tuyệt vời! Nhóm không có công việc nào trễ hạn.",
      size: "xs",
      color: "#666666",
      wrap: true
    });
  } else {
    overdueTasks.forEach(function(task, idx) {
      if (idx > 0) contents.push({ type: "separator", margin: "sm" });
      
      contents.push({
        type: "box",
        layout: "vertical",
        margin: "sm",
        spacing: "xs",
        contents: [
          {
            type: "text",
            text: "🚨 " + task.name,
            size: "xs",
            color: "#C70039",
            weight: "bold",
            wrap: true
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "👤: " + task.assignee,
                size: "xxs",
                color: "#666666",
                flex: 6,
                wrap: true
              },
              {
                type: "text",
                text: "Hạn: " + (task.deadline ? formatDateTimeDisplay(task.deadline) : "N/A"),
                size: "xxs",
                color: "#C70039",
                weight: "bold",
                flex: 4,
                align: "end"
              }
            ]
          }
        ]
      });
    });
  }
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#C70039",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "⚠️ DANH SÁCH CÔNG VIỆC TRỄ HẠN",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "14px",
      contents: contents
    }
  };
  
  return {
    type: "flex",
    altText: "Danh sách công việc trễ hạn",
    contents: bubble
  };
}

function buildBaoCaoCuoiNgayFlexMessage(gId) {
  var tasks = getActiveTasksList();
  
  var total = 0;
  var completed = 0;
  var overdue = 0;
  var support = 0;
  var doing = 0;
  var pending = 0;
  var canceled = 0;
  
  // Nhóm theo người hoàn thành để tính top
  var completionCounts = {};
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    if (String(row[0]).trim() === "") continue;
    
    var idG = String(row[5] || "").trim();
    if (gId && idG !== gId) continue;
    
    total++;
    var status = String(row[11] || "").trim();
    if (status === "Đã gửi") {
      completed++;
      // Đếm lượt hoàn thành cho người phụ trách
      var idNVs = String(row[6] || "").split(",");
      idNVs.forEach(function(uId) {
        uId = uId.trim();
        if (uId) {
          completionCounts[uId] = (completionCounts[uId] || 0) + 1;
        }
      });
    }
    else if (status === "Quá hạn") overdue++;
    else if (status === "Cần hỗ trợ") support++;
    else if (status === "Đang làm") doing++;
    else if (status === "Đã hủy") canceled++;
    else pending++;
  }
  
  // Tính top người hoàn thành
  var topPerformersList = [];
  for (var uId in completionCounts) {
    topPerformersList.push({ uId: uId, count: completionCounts[uId] });
  }
  topPerformersList.sort(function(a, b) { return b.count - a.count; });
  
  var topPerformersText = "Chưa có";
  if (topPerformersList.length > 0) {
    var topLines = topPerformersList.slice(0, 3).map(function(item, idx) {
      var name = resolveMemberName(item.uId, gId);
      return (idx + 1) + ". " + name + ": " + item.count + " việc";
    });
    topPerformersText = topLines.join("\n");
  }
  
  var groupLabel = "Tất cả nhóm";
  if (gId) {
    try {
      groupLabel = getGroupName(gId);
    } catch (e) {
      groupLabel = "Nhóm " + gId;
    }
  }

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#10B981",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "📊 BÁO CÁO TIẾN ĐỘ CUỐI NGÀY",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        },
        {
          type: "text",
          text: "Phạm vi: " + groupLabel,
          color: "#E0F2FE",
          size: "xxs",
          margin: "xs"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "14px",
      contents: [
        {
          type: "text",
          text: "Tổng hợp trạng thái công việc hiện tại:",
          size: "xs",
          color: "#666666"
        },
        {
          type: "separator"
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "📊 Tổng số công việc", size: "xs", color: "#333333", flex: 7 },
                { type: "text", text: String(total), size: "xs", weight: "bold", color: "#333333", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🎉 Đã hoàn thành", size: "xs", color: "#10B981", flex: 7 },
                { type: "text", text: String(completed), size: "xs", weight: "bold", color: "#10B981", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "⚡ Đang tiến hành", size: "xs", color: "#3B82F6", flex: 7 },
                { type: "text", text: String(doing), size: "xs", weight: "bold", color: "#3B82F6", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🆘 Cần hỗ trợ", size: "xs", color: "#7B61FF", flex: 7 },
                { type: "text", text: String(support), size: "xs", weight: "bold", color: "#7B61FF", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "⏳ Đang chờ xác nhận/ảnh", size: "xs", color: "#F59E0B", flex: 7 },
                { type: "text", text: String(pending), size: "xs", weight: "bold", color: "#F59E0B", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "⚠️ Đã quá hạn", size: "xs", color: "#EF4444", flex: 7 },
                { type: "text", text: String(overdue), size: "xs", weight: "bold", color: "#EF4444", flex: 3, align: "end" }
              ]
            }
          ]
        },
        {
          type: "separator"
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: "🏆 TOP HOÀN THÀNH:",
              size: "xs",
              weight: "bold",
              color: "#10B981"
            },
            {
              type: "text",
              text: topPerformersText,
              size: "xs",
              color: "#555555",
              wrap: true
            }
          ]
        },
        {
          type: "separator"
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: "Tỷ lệ hoàn thành: " + (total > 0 ? Math.round((completed / total) * 100) : 0) + "%",
              size: "xs",
              weight: "bold",
              color: "#10B981"
            }
          ]
        }
      ]
    }
  };
  
  return {
    type: "flex",
    altText: "Báo cáo cuối ngày",
    contents: bubble
  };
}

function getUserRole(userId) {
  if (!userId) return "Khách";
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("User_Roles");
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var colUserId = getColumnIndexByHeader(sheet, "User ID");
        var colRole = getColumnIndexByHeader(sheet, "Vai trò");
        var colStatus = getColumnIndexByHeader(sheet, "Trạng thái");
        
        if (colUserId !== -1 && colRole !== -1) {
          var lastCol = sheet.getLastColumn();
          var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
          for (var i = 0; i < data.length; i++) {
            if (String(data[i][colUserId - 1]).trim() === userId) {
              if (colStatus !== -1) {
                var status = String(data[i][colStatus - 1]).trim();
                if (status === "Tạm khóa") {
                  return "Khách";
                }
              }
              var role = String(data[i][colRole - 1]).trim();
              if (role) return role;
            }
          }
        }
      }
    }
  } catch (e) {
    writeLog("Lỗi khi đọc User_Roles: " + e.toString(), "WARNING", "getUserRole");
  }
  
  // Check ADMIN_USER_IDS in Script Properties / Settings sheet
  var adminProp = PropertiesService.getScriptProperties().getProperty("ADMIN_USER_IDS");
  if (!adminProp) {
    adminProp = getSetting("ADMIN_USER_IDS", "");
  }
  
  if (adminProp) {
    var adminList = adminProp.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    if (adminList.indexOf(userId) !== -1) {
      return "Admin";
    }
  } else {
    // Legacy fallback list to prevent lockout
    var defaultAdmins = [
      "Ua5509d3b3780ee833633e8b4ad332b70",
      "U5bc60a8b92b67f62fa417df854e4df75"
    ];
    if (defaultAdmins.indexOf(userId) !== -1) {
      return "Admin";
    }
  }
  
  return "Nhân viên"; // Default role to prevent disruption
}

function isAdmin(userId) {
  return getUserRole(userId) === "Admin";
}

function getManagedGroups(userId) {
  if (!userId) return [];
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("User_Roles");
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var colUserId = getColumnIndexByHeader(sheet, "User ID");
        var colGroups = getColumnIndexByHeader(sheet, "Nhóm phụ trách");
        if (colUserId !== -1 && colGroups !== -1) {
          var lastCol = sheet.getLastColumn();
          var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
          for (var i = 0; i < data.length; i++) {
            if (String(data[i][colUserId - 1]).trim() === userId) {
              var groupsStr = String(data[i][colGroups - 1]).trim();
              if (groupsStr) {
                return groupsStr.split(",").map(function(g) { return g.trim(); }).filter(Boolean);
              }
            }
          }
        }
      }
    }
  } catch (e) {
    writeLog("Lỗi khi đọc nhóm phụ trách: " + e.toString(), "WARNING");
  }
  return [];
}

function isLimitTaskCreation() {
  return getSetting("Giới hạn giao việc", "Không") === "Có";
}

function canCreateTask(userId, groupId) {
  var role = getUserRole(userId);
  if (role === "Admin" || role === "Quản lý") {
    return true;
  }
  if (role === "Tổ trưởng") {
    if (!groupId) {
      var managedGroups = getManagedGroups(userId);
      return managedGroups.length > 0;
    }
    var managedGroups = getManagedGroups(userId);
    return managedGroups.indexOf(groupId) !== -1;
  }
  if (isLimitTaskCreation()) {
    return false;
  }
  return true;
}

function canViewReport(userId, groupId) {
  var role = getUserRole(userId);
  if (role === "Admin" || role === "Quản lý") {
    return true;
  }
  if (role === "Tổ trưởng") {
    if (!groupId) return false;
    var managedGroups = getManagedGroups(userId);
    return managedGroups.indexOf(groupId) !== -1;
  }
  return false;
}

function canManageTask(userId, taskId) {
  var role = getUserRole(userId);
  if (role === "Admin" || role === "Quản lý") {
    return true;
  }
  if (role === "Tổ trưởng") {
    try {
      var ss = getSpreadsheet();
      var sheet = ss.getSheetByName("Sự kiện");
      if (sheet && taskId >= 2 && taskId <= sheet.getLastRow()) {
        var lastCol = sheet.getLastColumn();
        var rowValues = sheet.getRange(taskId, 1, 1, lastCol).getValues()[0];
        
        var colNhomNhan = getColumnIndexByHeader(sheet, "Nhóm nhận");
        var colNguoiGiao = getColumnIndexByHeader(sheet, "Người giao việc");
        
        var group = colNhomNhan !== -1 ? String(rowValues[colNhomNhan - 1]).trim() : "";
        var creator = colNguoiGiao !== -1 ? String(rowValues[colNguoiGiao - 1]).trim() : "";
        
        if (creator === userId) return true;
        
        var managedGroups = getManagedGroups(userId);
        if (group && managedGroups.indexOf(group) !== -1) {
          return true;
        }
      }
    } catch (e) {
      writeLog("Lỗi kiểm tra canManageTask: " + e.toString(), "WARNING");
    }
  }
  return false;
}

// ==========================================
// HÀM TIỆN ÍCH DỮ LIỆU & CONFIG & TASK ID
// ==========================================

function getColumnIndexByHeader(sheet, headerName) {
  if (!sheet) return -1;
  var sheetName = sheet.getName();
  var cacheKey = sheetName + ":" + headerName;
  if (_colIndexCache[cacheKey] !== undefined) {
    return _colIndexCache[cacheKey];
  }
  
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return -1;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === headerName) {
      _colIndexCache[cacheKey] = i + 1;
      return i + 1;
    }
  }
  _colIndexCache[cacheKey] = -1;
  return -1;
}

function clearColIndexCache() {
  _colIndexCache = {};
}

function getSetting(key, defaultValue) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Settings");
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var keyCol = getColumnIndexByHeader(sheet, "Key");
        if (keyCol === -1) keyCol = getColumnIndexByHeader(sheet, "Tham số");
        var valCol = getColumnIndexByHeader(sheet, "Value");
        if (valCol === -1) valCol = getColumnIndexByHeader(sheet, "Giá trị");
        
        if (keyCol !== -1 && valCol !== -1) {
          var lastCol = sheet.getLastColumn();
          var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
          for (var i = 0; i < data.length; i++) {
            if (String(data[i][keyCol - 1]).trim() === key) {
              return String(data[i][valCol - 1]);
            }
          }
        }
      }
    }
  } catch (e) {
    writeLog("Lỗi khi đọc setting '" + key + "': " + e.toString(), "WARNING");
  }
  return defaultValue;
}

function setSetting(key, value, description) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Settings");
    if (!sheet) {
      ensureSheetAndHeaders();
      sheet = ss.getSheetByName("Settings");
    }
    if (sheet) {
      var keyCol = getColumnIndexByHeader(sheet, "Key");
      if (keyCol === -1) keyCol = getColumnIndexByHeader(sheet, "Tham số");
      var valCol = getColumnIndexByHeader(sheet, "Value");
      if (valCol === -1) valCol = getColumnIndexByHeader(sheet, "Giá trị");
      var descCol = getColumnIndexByHeader(sheet, "Mô tả");
      
      var lastRow = sheet.getLastRow();
      var foundRow = -1;
      if (lastRow >= 2) {
        var lastCol = sheet.getLastColumn();
        var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
        for (var i = 0; i < data.length; i++) {
          if (String(data[i][keyCol - 1]).trim() === key) {
            foundRow = i + 2;
            break;
          }
        }
      }
      
      if (foundRow !== -1) {
        if (valCol !== -1) sheet.getRange(foundRow, valCol).setValue(value);
        if (description && descCol !== -1) sheet.getRange(foundRow, descCol).setValue(description);
      } else {
        var newRow = [];
        var maxCol = sheet.getLastColumn();
        for (var col = 1; col <= maxCol; col++) {
          if (col === keyCol) newRow.push(key);
          else if (col === valCol) newRow.push(value);
          else if (col === descCol) newRow.push(description || "");
          else newRow.push("");
        }
        sheet.appendRow(newRow);
      }
    }
  } catch (e) {
    writeLog("Lỗi khi ghi setting '" + key + "': " + e.toString(), "WARNING");
  }
}

function generateTaskId(dateVal) {
  var d = (dateVal && typeof dateVal.getTime === 'function') ? dateVal : new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  var yyyy = d.getFullYear();
  var MM = pad(d.getMonth() + 1);
  var dd = pad(d.getDate());
  var HH = pad(d.getHours());
  var mm = pad(d.getMinutes());
  var ss = pad(d.getSeconds());
  
  var rand = "";
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (var i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return "TASK-" + yyyy + MM + dd + "-" + HH + mm + ss + "-" + rand;
}

function appendTaskLog(taskId, action, oldValue, newValue, note) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Task_Logs");
    if (!sheet) {
      ensureSheetAndHeaders();
      sheet = ss.getSheetByName("Task_Logs");
    }
    if (sheet) {
      var timeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "yyyy-MM-dd HH:mm:ss");
      var executor = globalCurrentUserName || "Hệ thống";
      
      var timeCol = getColumnIndexByHeader(sheet, "Thời gian");
      var taskIdCol = getColumnIndexByHeader(sheet, "Task ID");
      var actionCol = getColumnIndexByHeader(sheet, "Hành động");
      var execCol = getColumnIndexByHeader(sheet, "Người thực hiện");
      var oldCol = getColumnIndexByHeader(sheet, "Nội dung cũ");
      var newCol = getColumnIndexByHeader(sheet, "Nội dung mới");
      var noteCol = getColumnIndexByHeader(sheet, "Ghi chú");
      
      var maxCol = Math.max(sheet.getLastColumn(), 7);
      var rowData = new Array(maxCol);
      for (var i = 0; i < maxCol; i++) {
        rowData[i] = "";
      }
      
      if (timeCol !== -1) rowData[timeCol - 1] = timeStr;
      if (taskIdCol !== -1) rowData[taskIdCol - 1] = taskId || "";
      if (actionCol !== -1) rowData[actionCol - 1] = action || "";
      if (execCol !== -1) rowData[execCol - 1] = executor;
      if (oldCol !== -1) rowData[oldCol - 1] = oldValue || "";
      if (newCol !== -1) rowData[newCol - 1] = newValue || "";
      if (noteCol !== -1) rowData[noteCol - 1] = note || "";
      
      sheet.appendRow(rowData);
    }
  } catch (e) {
    writeLog("Lỗi khi ghi Task_Logs: " + e.toString(), "WARNING");
  }
}

function ensureSheetAndHeaders() {
  var ss = getSpreadsheet();
  clearColIndexCache();
  
  // Define expected sheets and headers
  var sheetsDef = {
    "Sự kiện": ["Task ID", "Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"],
    "ID_Group": ["Tên Group", "ID Group"],
    "ID_Member": ["Tên Line", "ID Line"],
    "Tương Tác": ["Thời gian", "User ID", "Tên Line", "Nhóm", "Hành động", "Nội dung"],
    "Chatbot": ["Từ khóa", "Văn bản trả lời", "Link ảnh Google Drive"],
    "Link_img": ["Tên Ảnh", "Link Ảnh"],
    "Logs": ["Thời gian", "Loại", "Nội dung log"],
    "Settings": ["Key", "Value", "Mô tả"],
    "User_Roles": ["Tên Line", "User ID", "Vai trò", "Nhóm phụ trách", "Trạng thái", "Ghi chú", "Ngày cập nhật"],
    "Task_Logs": ["Thời gian", "Task ID", "Hành động", "Người thực hiện", "Nội dung cũ", "Nội dung mới", "Ghi chú"],
    "Task_Comments": ["Thời gian", "Task ID", "User ID", "Tên Line", "Bình luận", "Link ảnh"],
    "Task_Templates": ["Tên mẫu", "Loại công việc", "Tiêu đề mẫu", "Nội dung mẫu", "Ưu tiên mặc định", "Hình thức xác nhận mặc định"],
    "Daily_Report": ["Ngày", "Group ID", "Tổng việc", "Đã xong", "Chưa xong", "Quá hạn", "Cần hỗ trợ", "Nội dung báo cáo"]
  };
  
  for (var sheetName in sheetsDef) {
    var expectedHeaders = sheetsDef[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(expectedHeaders);
      continue;
    }
    
    // Sheet exists. Let's check/migrate headers.
    var lastCol = sheet.getLastColumn();
    var actualHeaders = [];
    if (lastCol > 0) {
      actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
    }
    
    // Custom migration for Settings
    if (sheetName === "Settings") {
      var renamed = false;
      for (var i = 0; i < actualHeaders.length; i++) {
        if (actualHeaders[i] === "Tham số") {
          actualHeaders[i] = "Key";
          sheet.getRange(1, i + 1).setValue("Key");
          renamed = true;
        } else if (actualHeaders[i] === "Giá trị") {
          actualHeaders[i] = "Value";
          sheet.getRange(1, i + 1).setValue("Value");
          renamed = true;
        }
      }
    }
    
    // Custom migration for Sự kiện (prepend Task ID if not present)
    if (sheetName === "Sự kiện") {
      var hasTaskId = false;
      for (var i = 0; i < actualHeaders.length; i++) {
        if (actualHeaders[i] === "Task ID") {
          hasTaskId = true;
          break;
        }
      }
      if (!hasTaskId) {
        // Prepend Task ID column
        sheet.insertColumnBefore(1);
        sheet.getRange(1, 1).setValue("Task ID");
        actualHeaders.unshift("Task ID");
        
        // Populate existing rows with Task ID
        var lastRow = sheet.getLastRow();
        if (lastRow >= 2) {
          var dateColIdx = actualHeaders.indexOf("Ngày giờ gửi") + 1; // 1-based index
          var dateVals = sheet.getRange(2, dateColIdx, lastRow - 1, 1).getValues();
          var taskIds = [];
          for (var rIdx = 0; rIdx < dateVals.length; rIdx++) {
            var dateVal = dateVals[rIdx][0];
            var d = convertToDate(dateVal) || new Date();
            taskIds.push([generateTaskId(d)]);
          }
          sheet.getRange(2, 1, lastRow - 1, 1).setValues(taskIds);
        }
      } else {
        // Task ID exists, check if any rows are missing Task ID and generate
        var lastRow = sheet.getLastRow();
        if (lastRow >= 2) {
          var taskIdColIdx = actualHeaders.indexOf("Task ID") + 1;
          var dateColIdx = actualHeaders.indexOf("Ngày giờ gửi") + 1;
          
          var taskIdVals = sheet.getRange(2, taskIdColIdx, lastRow - 1, 1).getValues();
          var dateVals = dateColIdx > 0 ? sheet.getRange(2, dateColIdx, lastRow - 1, 1).getValues() : null;
          
          var updatedTaskIds = [];
          var needsUpdate = false;
          for (var rIdx = 0; rIdx < taskIdVals.length; rIdx++) {
            var tid = String(taskIdVals[rIdx][0]).trim();
            if (!tid) {
              var dateVal = dateVals ? dateVals[rIdx][0] : null;
              var d = convertToDate(dateVal) || new Date();
              updatedTaskIds.push([generateTaskId(d)]);
              needsUpdate = true;
            } else {
              updatedTaskIds.push([tid]);
            }
          }
          if (needsUpdate) {
            sheet.getRange(2, taskIdColIdx, lastRow - 1, 1).setValues(updatedTaskIds);
          }
        }
      }
    }
    
    // Add any other missing headers at the end safely
    for (var k = 0; k < expectedHeaders.length; k++) {
      var hExpected = expectedHeaders[k];
      if (actualHeaders.indexOf(hExpected) === -1) {
        // Append missing header
        var nextCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, nextCol).setValue(hExpected);
        actualHeaders.push(hExpected);
      }
    }
  }
  clearColIndexCache();
}

function getLast5ErrorLogs() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Logs");
  if (!sheet) return "Không tìm thấy sheet Logs.";
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "Chưa có log nào.";
  
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var errorLogs = [];
  
  for (var i = data.length - 1; i >= 0; i--) {
    var type = String(data[i][1]).trim().toUpperCase();
    if (type === "ERROR") {
      errorLogs.push(data[i][0] + " [" + type + "] " + data[i][2]);
      if (errorLogs.length >= 5) break;
    }
  }
  
  if (errorLogs.length === 0) return "Không có log lỗi nào gần đây.";
  return errorLogs.join("\n");
}

function buildBotStatusFlexMessage() {
  var ssOk = "OK";
  try {
    var ss = getSpreadsheet();
    if (!ss.getSheetByName("Sự kiện")) ssOk = "Lỗi Sheet";
  } catch (e) {
    ssOk = "Lỗi: " + e.toString();
  }
  
  var triggerOk = "Chưa kích hoạt";
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var active = triggers.some(function(t) { return t.getHandlerFunction() === "checkAndSendLineMessage"; });
    if (active) triggerOk = "Đang chạy (1 phút/lần)";
  } catch (e) {
    triggerOk = "Lỗi: " + e.toString();
  }
  
  var richMenuId = "Không có";
  try {
    var res = callLineApi("user/all/richmenu", { method: "get", muteHttpExceptions: true }, "Lấy Rich Menu mặc định");
    if (res.getResponseCode() === 200) {
      var resObj = JSON.parse(res.getContentText());
      richMenuId = resObj.richMenuId || "Không có rich menu mặc định";
    }
  } catch (e) {
    richMenuId = "Lỗi: " + e.toString();
  }
  
  var errorLogCount = 0;
  try {
    var ssLogs = getSpreadsheet();
    var sLogs = ssLogs.getSheetByName("Logs");
    if (sLogs) {
      var lastRow = sLogs.getLastRow();
      if (lastRow >= 2) {
        var colType = getColumnIndexByHeader(sLogs, "Loại");
        if (colType !== -1) {
          var types = sLogs.getRange(2, colType, lastRow - 1, 1).getValues();
          for (var i = 0; i < types.length; i++) {
            if (String(types[i][0]).trim() === "ERROR") {
              errorLogCount++;
            }
          }
        }
      }
    }
  } catch (errLogs) {}
  
  var serverTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "yyyy-MM-dd HH:mm:ss");
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#4F46E5",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "🤖 TRẠNG THÁI HỆ THỐNG BOT",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "14px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🌐 Webhook", size: "xs", color: "#666666", flex: 4 },
                { type: "text", text: "Đang hoạt động (OK)", size: "xs", weight: "bold", color: "#1DB446", flex: 6 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "📊 Google Sheet", size: "xs", color: "#666666", flex: 4 },
                { type: "text", text: ssOk, size: "xs", weight: "bold", color: ssOk === "OK" ? "#1DB446" : "#C70039", flex: 6 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "⏰ Trình kích hoạt", size: "xs", color: "#666666", flex: 4 },
                { type: "text", text: triggerOk, size: "xs", weight: "bold", color: triggerOk.indexOf("Đang chạy") !== -1 ? "#1DB446" : "#C70039", flex: 6 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🔑 LIFF ID", size: "xs", color: "#666666", flex: 4 },
                { type: "text", text: getLiffId() || "Chưa thiết lập", size: "xs", color: "#333333", flex: 6 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🖼️ Rich Menu ID", size: "xs", color: "#666666", flex: 4 },
                { type: "text", text: richMenuId, size: "xs", color: "#333333", wrap: true, flex: 6 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🛑 Số log lỗi", size: "xs", color: "#666666", flex: 4 },
                { type: "text", text: String(errorLogCount), size: "xs", weight: "bold", color: errorLogCount > 0 ? "#C70039" : "#1DB446", flex: 6 }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🕒 Giờ server", size: "xs", color: "#666666", flex: 4 },
                { type: "text", text: serverTime, size: "xs", color: "#333333", flex: 6 }
              ]
            }
          ]
        }
      ]
    }
  };
  return {
    type: "flex",
    altText: "Trạng thái hệ thống Bot",
    contents: bubble
  };
}

function buildTemplatesFlexMessage() {
  var templates = [
    { title: "Kiểm tra tồn", desc: "Tên: Kiểm tra tồn kho\nNội dung: Đối chiếu số lượng thực tế..." },
    { title: "Truyền thông Rush", desc: "Tên: Truyền thông Rush\nNội dung: Đăng bài gấp lên fanpage..." },
    { title: "Chụp ảnh trưng bày", desc: "Tên: Chụp ảnh quầy trưng bày\nNội dung: Chụp góc nghiêng và chính diện..." },
    { title: "Nhắc họp đầu ca", desc: "Tên: Họp đầu ca 15 phút\nNội dung: Điểm danh và triển khai kế hoạch..." },
    { title: "Hoàn tất báo cáo", desc: "Tên: Hoàn tất báo cáo ngày\nNội dung: Gửi số liệu trước 18:00..." },
    { title: "Kiểm tra quầy kệ", desc: "Tên: Sắp xếp vệ sinh quầy kệ\nNội dung: Lau dọn quầy kệ khu A..." },
    { title: "Gọi hẹn nhận hàng", desc: "Tên: Gọi khách hẹn nhận hàng\nNội dung: Liên hệ khách báo hàng đã về..." },
    { title: "Chăm sóc sau bán", desc: "Tên: Chăm sóc khách hàng\nNội dung: Gọi khách hỏi thăm trải nghiệm..." }
  ];
  
  var contents = [];
  templates.forEach(function(t, idx) {
    if (idx > 0) contents.push({ type: "separator", margin: "sm" });
    contents.push({
      type: "box",
      layout: "vertical",
      margin: "sm",
      contents: [
        { type: "text", text: "📋 Mẫu: " + t.title, size: "xs", weight: "bold", color: "#1DB446" },
        { type: "text", text: t.desc, size: "xxs", color: "#666666", wrap: true }
      ]
    });
  });
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1DB446",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "📋 MẪU CÔNG VIỆC NHANH (LIFF TEMPLATES)",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "14px",
      contents: contents
    }
  };
  return {
    type: "flex",
    altText: "Mẫu công việc nhanh",
    contents: bubble
  };
}

function buildDaGiaoFlexMessage(uId, uName, gId) {
  var tasks = getActiveTasksList();
  var myAssignedTasks = [];
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    var status = String(row[11] || "").trim();
    if (status === "Đã gửi" || status === "Đã hủy") continue;
    
    var nguoiGiao = String(row[17] || "").trim();
    var idG = String(row[5] || "").trim();
    
    if (nguoiGiao === uId) {
      if (gId && idG !== gId) continue;
      myAssignedTasks.push({
        name: row[0],
        assignee: resolveMemberNamesList(row[6]),
        deadline: row[15],
        status: status
      });
    }
  }
  
  var contents = [];
  if (myAssignedTasks.length === 0) {
    contents.push({
      type: "text",
      text: "Bạn chưa giao công việc nào chưa hoàn thành.",
      size: "xs",
      color: "#666666",
      wrap: true
    });
  } else {
    myAssignedTasks.forEach(function(task, idx) {
      if (idx > 0) contents.push({ type: "separator", margin: "sm" });
      
      var statusColor = "#1DB446";
      if (task.status === "Quá hạn") statusColor = "#C70039";
      else if (task.status === "Cần hỗ trợ") statusColor = "#7B61FF";
      else if (task.status === "Đang làm") statusColor = "#3B82F6";
      else statusColor = "#F59E0B";
      
      contents.push({
        type: "box",
        layout: "vertical",
        margin: "sm",
        spacing: "xs",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "• " + task.name,
                size: "xs",
                color: "#333333",
                weight: "bold",
                flex: 7,
                wrap: true
              },
              {
                type: "text",
                text: task.status,
                size: "xxs",
                color: statusColor,
                weight: "bold",
                flex: 3,
                align: "end"
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "👤 Nhận: " + task.assignee,
                size: "xxs",
                color: "#666666",
                flex: 6,
                wrap: true
              },
              {
                type: "text",
                text: "⏰: " + (task.deadline ? formatDateTimeDisplay(task.deadline) : "N/A"),
                size: "xxs",
                color: "#888888",
                flex: 4,
                align: "end"
              }
            ]
          }
        ]
      });
    });
  }
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#10B981",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "📤 VIỆC TÔI ĐÃ GIAO",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "14px",
      contents: contents
    }
  };
  
  return {
    type: "flex",
    altText: "Việc tôi đã giao",
    contents: bubble
  };
}

function handleTextCommand(event, text, uId, gId) {
  var ss = getSpreadsheet();
  var name = getUserName(uId, gId);
  globalCurrentUserName = name;
  var cmd = text.trim().toLowerCase();
  
  // Ghi log nhận lệnh
  writeLog("Lệnh bot nhận được: '" + text + "' | userId=" + uId + " | groupId=" + (gId || "Chat riêng"), "INFO");
  
  // 1. Trợ giúp cú pháp
  if (["/help", "help", "trợ giúp", "tro giup", "cú pháp", "cu phap"].indexOf(cmd) !== -1) {
    replyHelp(event.replyToken);
    return true;
  }
  
  // 2. Hướng dẫn / giới thiệu BOT
  if (["/hd", "/huongdan", "hướng dẫn", "huong dan", "giới thiệu", "gioi thieu"].indexOf(cmd) !== -1) {
    replyHuongDanBot(event.replyToken);
    return true;
  }
  
  // 3. Mở form giao việc
  if ([
    "/gv", "/link", "/giao", "/tao", "/do", "link",
    "tạo việc", "tao viec", "giao việc", "giao viec", "mở giao việc", "mo giao viec"
  ].indexOf(cmd) !== -1) {
    if (!canCreateTask(uId, gId)) {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền sử dụng chức năng giao việc!");
      return true;
    }
    replyGiaoForm(event.replyToken);
    return true;
  }
  
  // 4. Lấy ID
  if (["/id", "id", "lấy id", "lay id"].indexOf(cmd) !== -1) {
    if (gId) {
      sendLineReply(event.replyToken, "🆔 Group ID:\n" + gId + "\n\n👤 User ID:\n" + uId);
    } else {
      sendLineReply(event.replyToken, "👤 User ID:\n" + uId);
    }
    return true;
  }
  
  // 5. Tương tác hôm nay
  if ([
    "/tthomnay", "/tuongtac", "tương tác", "tuong tac",
    "tương tác hôm nay", "tuong tac hom nay",
    "/homnay", "hôm nay", "hom nay", "/tthn"
  ].indexOf(cmd) !== -1) {
    if (gId) {
      guiBaoCaoTuongTac(gId, event.replyToken, 1);
    } else {
      sendLineReply(event.replyToken, "📌 Lệnh này chỉ dùng được trong nhóm LINE để tra cứu tương tác của nhóm.");
    }
    return true;
  }
  
  // 6. Tương tác 7 ngày
  if ([
    "/tt7ngay", "tương tác 7 ngày", "tuong tac 7 ngay",
    "/7ngay", "7 ngày", "7 ngay", "/ttt"
  ].indexOf(cmd) !== -1) {
    if (gId) {
      guiBaoCaoTuongTac(gId, event.replyToken, 7);
    } else {
      sendLineReply(event.replyToken, "📅 Lệnh này chỉ dùng được trong nhóm LINE để tra cứu tương tác của nhóm.");
    }
    return true;
  }
  
  // 7. Việc của tôi
  if (["/vieccuatoi", "việc của tôi", "viec cua toi"].indexOf(cmd) !== -1) {
    var role = getUserRole(uId);
    if (role === "Khách" || role === "Khách/Chưa xác định") {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền sử dụng chức năng này!");
      return true;
    }
    var flex = buildMyTasksFlexMessage(uId, name, gId);
    replyMessages(event.replyToken, [flex], "LINE my tasks reply");
    return true;
  }
  
  // 8. Chưa xong
  if (["/chuaxong", "chưa xong", "chua xong"].indexOf(cmd) !== -1) {
    if (gId) {
      if (!canViewReport(uId, gId)) {
        sendLineReply(event.replyToken, "🚫 Bạn không có quyền xem báo cáo của nhóm này!");
        return true;
      }
      var flex = buildChuaXongFlexMessage(gId);
      replyMessages(event.replyToken, [flex], "LINE pending tasks reply");
    } else {
      sendLineReply(event.replyToken, "📌 Lệnh này chỉ dùng được trong nhóm LINE để tra cứu công việc chưa xong của nhóm.");
    }
    return true;
  }
  
  // 9. Trễ hạn
  if (["/trehan", "trễ hạn", "tre han"].indexOf(cmd) !== -1) {
    if (gId) {
      if (!canViewReport(uId, gId)) {
        sendLineReply(event.replyToken, "🚫 Bạn không có quyền xem báo cáo của nhóm này!");
        return true;
      }
      var flex = buildTreHanFlexMessage(gId);
      replyMessages(event.replyToken, [flex], "LINE overdue tasks reply");
    } else {
      sendLineReply(event.replyToken, "⚠️ Lệnh này chỉ dùng được trong nhóm LINE để tra cứu công việc trễ hạn của nhóm.");
    }
    return true;
  }
  
  // 10. Đã giao
  if (["/dagiao", "đã giao", "da giao"].indexOf(cmd) !== -1) {
    var role = getUserRole(uId);
    if (role === "Khách" || role === "Khách/Chưa xác định") {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền sử dụng chức năng này!");
      return true;
    }
    var flex = buildDaGiaoFlexMessage(uId, name, gId);
    replyMessages(event.replyToken, [flex], "LINE tasks assigned by me reply");
    return true;
  }
  
  // 11. Bot status
  if (["/bot", "trạng thái bot", "trang thai bot"].indexOf(cmd) !== -1) {
    var flex = buildBotStatusFlexMessage();
    replyMessages(event.replyToken, [flex], "LINE bot status reply");
    return true;
  }
  
  // 12. Mẫu việc
  if (["/mau", "mẫu", "mau", "mẫu công việc", "mau cong viec"].indexOf(cmd) !== -1) {
    var flex = buildTemplatesFlexMessage();
    replyMessages(event.replyToken, [flex], "LINE templates list reply");
    return true;
  }
  
  // 13. Xem log (Admin only)
  if (["/log", "xem log", "log"].indexOf(cmd) !== -1) {
    if (isAdmin(uId)) {
      var logs = getLast5ErrorLogs();
      sendLineReply(event.replyToken, "📝 5 DÒNG LOG LỖI GẦN NHẤT:\n\n" + logs);
    } else {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền Admin để sử dụng lệnh này!");
    }
    return true;
  }
  
  // 14. Reset menu (Admin only)
  if (["/resetmenu", "reset menu"].indexOf(cmd) !== -1) {
    if (isAdmin(uId)) {
      try {
        SETUP_RICH_MENU();
        var richMenuId = PropertiesService.getScriptProperties().getProperty("RICH_MENU_ID");
        var successMsg = "✅ Đã tạo lại Rich Menu thành công!\nID: " + richMenuId + "\n\n" +
                         "👉 Bước tiếp theo:\n" +
                         "1. Mở Google Sheet.\n" +
                         "2. Chọn menu 🤖 LINE BOT -> '🖼️ Upload ảnh Rich Menu' để tải ảnh lên.\n" +
                         "3. Chọn '✅ Đặt Rich Menu mặc định' để áp dụng cho toàn bộ thành viên.";
        sendLineReply(event.replyToken, successMsg);
      } catch (err) {
        sendLineReply(event.replyToken, "❌ Lỗi tạo Rich Menu: " + err.toString());
      }
    } else {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền Admin để sử dụng lệnh này!");
    }
    return true;
  }
  
  // 14a. Báo cáo việc hôm nay
  if (["/viechomnay", "việc hôm nay", "viec hom nay", "/vhn"].indexOf(cmd) !== -1) {
    if (!canViewReport(uId, gId)) {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền xem báo cáo này!");
      return true;
    }
    var flex = buildBaoCaoViecHomNayFlexMessage(gId);
    replyMessages(event.replyToken, [flex], "LINE today tasks report reply");
    return true;
  }
  
  // 14b. Báo cáo việc 7 ngày
  if (["/viec7ngay", "việc 7 ngày", "viec 7 ngay", "/v7n"].indexOf(cmd) !== -1) {
    if (!canViewReport(uId, gId)) {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền xem báo cáo này!");
      return true;
    }
    var flex = buildBaoCaoViec7NgayFlexMessage(gId);
    replyMessages(event.replyToken, [flex], "LINE 7 days tasks report reply");
    return true;
  }
  
  // 14c. Báo cáo theo nhân viên (cú pháp: /nv [tên/userId] hoặc nhân viên [tên/userId])
  var isNvCmd = false;
  var nvQuery = "";
  if (cmd === "/nv" || cmd === "nhân viên" || cmd === "nhan vien") {
    isNvCmd = true;
  } else if (cmd.startsWith("/nv ")) {
    isNvCmd = true;
    nvQuery = text.substring(4).trim();
  } else if (cmd.startsWith("nhân viên ")) {
    isNvCmd = true;
    nvQuery = text.substring(10).trim();
  } else if (cmd.startsWith("nhan vien ")) {
    isNvCmd = true;
    nvQuery = text.substring(10).trim();
  }
  
  if (isNvCmd) {
    var role = getUserRole(uId);
    if (role === "Khách" || role === "Khách/Chưa xác định") {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền sử dụng chức năng này!");
      return true;
    }
    
    // Resolve target UId if query is provided
    var targetUId = uId;
    if (nvQuery) {
      var sMem = ss.getSheetByName("ID_Member");
      if (sMem) {
        var memVals = sMem.getDataRange().getValues();
        var qClean = nvQuery.trim().toLowerCase();
        for (var k = 1; k < memVals.length; k++) {
          var nameVal = String(memVals[k][0]).trim().toLowerCase();
          var idVal = String(memVals[k][1]).trim().toLowerCase();
          if (idVal === qClean || nameVal === qClean || nameVal.indexOf(qClean) !== -1) {
            targetUId = memVals[k][1];
            break;
          }
        }
      }
    }
    
    var isSelf = (targetUId === uId);
    if (!isSelf) {
      if (role !== "Admin" && role !== "Quản lý" && role !== "Tổ trưởng") {
        sendLineReply(event.replyToken, "🚫 Bạn không có quyền xem báo cáo của nhân viên khác!");
        return true;
      }
    }
    
    var flex = buildBaoCaoNhanVienFlexMessage(nvQuery, uId, gId);
    replyMessages(event.replyToken, [flex], "LINE employee tasks report reply");
    return true;
  }
  
  // 14d. Báo cáo tuần (lệnh /baocaotuan hoặc báo cáo tuần)
  if (["/baocaotuan", "báo cáo tuần", "bao cao tuan", "/bct"].indexOf(cmd) !== -1) {
    if (!canViewReport(uId, gId)) {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền xem báo cáo này!");
      return true;
    }
    var flex = buildBaoCaoViec7NgayFlexMessage(gId);
    flex.altText = "Báo cáo tuần công việc";
    replyMessages(event.replyToken, [flex], "LINE weekly tasks report reply");
    return true;
  }
  
  // 14e. Xem quyền cá nhân
  if (cmd === "/role" || cmd === "quyền" || cmd === "quyen") {
    var role = getUserRole(uId);
    var resMsg = "👤 THÔNG TIN TÀI KHOẢN:\n" +
                 "- Tên hiển thị: " + name + "\n" +
                 "- Vai trò: " + role + "\n" +
                 "- User ID: " + uId;
    if (role === "Tổ trưởng") {
      var managed = getManagedGroups(uId);
      resMsg += "\n- Nhóm phụ trách: " + (managed.length > 0 ? managed.join(", ") : "Chưa cấu hình");
    }
    sendLineReply(event.replyToken, resMsg);
    return true;
  }
  
  // 14f. Hướng dẫn phân quyền
  if (cmd === "/phanquyen" || cmd === "phân quyền" || cmd === "phan quyen") {
    var huongDan = "⚙️ HƯỚNG DẪN CẤU HÌNH PHÂN QUYỀN (User_Roles)\n\n" +
                   "Để phân quyền cho các thành viên, hãy mở Google Sheet và cấu hình trong bảng 'User_Roles':\n\n" +
                   "1. Các cột cần nhập:\n" +
                   "- Tên Line: Tên hiển thị (tùy chọn)\n" +
                   "- User ID: ID LINE của người dùng (bắt buộc, dùng lệnh /id để lấy)\n" +
                   "- Vai trò: Admin / Quản lý / Tổ trưởng / Nhân viên / Khách\n" +
                   "- Nhóm phụ trách: (Chỉ dành cho Tổ trưởng) Nhập các ID nhóm phân cách bằng dấu phẩy (ví dụ: G123,G456)\n" +
                   "- Trạng thái: Hoạt động / Tạm khóa\n\n" +
                   "2. Quyền hạn chi tiết:\n" +
                   "- Admin: Toàn quyền hệ thống, xem log (/log), reset menu (/resetmenu).\n" +
                   "- Quản lý: Giao việc, xem báo cáo, hủy việc, giao lại việc.\n" +
                   "- Tổ trưởng: Quản lý và xem báo cáo trong Nhóm phụ trách.\n" +
                   "- Nhân viên: Xem việc của mình, xác nhận hoàn tất, gửi ảnh nghiệm thu.\n" +
                   "- Khách: Chỉ xem help và lấy ID. Không được giao việc nếu bật chế độ giới hạn.\n\n" +
                   "💡 Mẹo: Dùng lệnh `/addadmin [User ID]` để gán nhanh quyền Admin từ LINE.";
    sendLineReply(event.replyToken, huongDan);
    return true;
  }
  
  // 14g. Thêm Admin (Admin only)
  if (cmd.startsWith("/addadmin ")) {
    if (!isAdmin(uId)) {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền Admin để sử dụng lệnh này!");
      return true;
    }
    var targetAdminId = text.substring(10).trim();
    if (!targetAdminId) {
      sendLineReply(event.replyToken, "⚠️ Vui lòng nhập User ID của người muốn thêm làm Admin.\nCú pháp: /addadmin [User ID]");
      return true;
    }
    
    try {
      var sRoles = ss.getSheetByName("User_Roles");
      if (sRoles) {
        var rolesData = sRoles.getDataRange().getValues();
        var existingRowIndex = -1;
        for (var k = 1; k < rolesData.length; k++) {
          if (String(rolesData[k][1]).trim() === targetAdminId) {
            existingRowIndex = k + 1;
            break;
          }
        }
        
        var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
        var targetLineName = getUserName(targetAdminId);
        
        if (existingRowIndex !== -1) {
          sRoles.getRange(existingRowIndex, 3).setValue("Admin");
          sRoles.getRange(existingRowIndex, 5).setValue("Hoạt động");
          sRoles.getRange(existingRowIndex, 7).setValue(todayStr);
        } else {
          sRoles.appendRow([targetLineName, targetAdminId, "Admin", "", "Hoạt động", "Thêm nhanh qua LINE Bot", todayStr]);
        }
        sendLineReply(event.replyToken, "✅ Đã gán quyền Admin thành công cho:\n- Tên: " + targetLineName + "\n- ID: " + targetAdminId);
      } else {
        sendLineReply(event.replyToken, "❌ Không tìm thấy sheet User_Roles.");
      }
    } catch (e) {
      sendLineReply(event.replyToken, "❌ Lỗi khi thêm Admin: " + e.toString());
    }
    return true;
  }
  
  // 14h. Hủy việc (Admin, Quản lý, Tổ trưởng trong nhóm phụ trách / do mình tạo)
  if (cmd.startsWith("/huy ")) {
    var parts = text.split(" ");
    var rowIndex = parseInt(parts[1], 10);
    if (isNaN(rowIndex)) {
      sendLineReply(event.replyToken, "⚠️ Cú pháp không hợp lệ. Vui lòng sử dụng: /huy [số dòng]\nVí dụ: /huy 5");
      return true;
    }
    
    if (canManageTask(uId, rowIndex)) {
      try {
        var sEv = ss.getSheetByName("Sự kiện");
        if (sEv && rowIndex >= 2 && rowIndex <= sEv.getLastRow()) {
          var colStatus = getColumnIndexByHeader(sEv, "Trạng thái");
          var colLichSu = getColumnIndexByHeader(sEv, "Lịch sử cập nhật");
          var colTaskId = getColumnIndexByHeader(sEv, "Task ID");
          
          var currentStatus = colStatus !== -1 ? String(sEv.getRange(rowIndex, colStatus).getValue()).trim() : "";
          var taskId = colTaskId !== -1 ? String(sEv.getRange(rowIndex, colTaskId).getValue()).trim() : "";
          
          if (currentStatus === "Đã gửi" || currentStatus === "Đã hủy") {
            sendLineReply(event.replyToken, "⚠️ Công việc ở dòng " + rowIndex + " đã " + (currentStatus === "Đã gửi" ? "hoàn thành" : "bị hủy") + " trước đó!");
          } else {
            if (colStatus !== -1) sEv.getRange(rowIndex, colStatus).setValue("Đã hủy");
            var existingHistory = colLichSu !== -1 ? sEv.getRange(rowIndex, colLichSu).getValue() : "";
            var newHistory = name + " hủy việc lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
            if (colLichSu !== -1) sEv.getRange(rowIndex, colLichSu).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
            
            appendTaskLog(taskId, "Hủy việc", currentStatus, "Đã hủy", "Người dùng thực hiện lệnh /huy");
            sendLineReply(event.replyToken, "❌ Đã hủy công việc dòng " + rowIndex + " thành công!");
          }
        } else {
          sendLineReply(event.replyToken, "❌ Dòng công việc " + rowIndex + " không tồn tại hoặc không hợp lệ!");
        }
      } catch (e) {
        sendLineReply(event.replyToken, "❌ Lỗi khi hủy việc: " + e.toString());
      }
    } else {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền hủy công việc này!");
    }
    return true;
  }
  
  // 14i. Giao lại việc (Admin, Quản lý, Tổ trưởng trong nhóm phụ trách / do mình tạo)
  if (cmd.startsWith("/giaolai ")) {
    var parts = text.split(" ");
    if (parts.length < 3) {
      sendLineReply(event.replyToken, "⚠️ Cú pháp không hợp lệ. Vui lòng sử dụng: /giaolai [số dòng] [tên/User ID nhân viên]\nVí dụ: /giaolai 5 U222");
      return true;
    }
    var rowIndex = parseInt(parts[1], 10);
    var targetQuery = text.substring(text.indexOf(parts[2])).trim();
    
    if (isNaN(rowIndex)) {
      sendLineReply(event.replyToken, "⚠️ Số dòng không hợp lệ! Ví dụ: /giaolai 5 U222");
      return true;
    }
    
    if (canManageTask(uId, rowIndex)) {
      try {
        var sEv = ss.getSheetByName("Sự kiện");
        if (sEv && rowIndex >= 2 && rowIndex <= sEv.getLastRow()) {
          var targetId = targetQuery;
          var targetName = targetQuery;
          var sMem = ss.getSheetByName("ID_Member");
          if (sMem) {
            var memVals = sMem.getDataRange().getValues();
            var qClean = targetQuery.trim().toLowerCase();
            for (var k = 1; k < memVals.length; k++) {
              var nameVal = String(memVals[k][0]).trim().toLowerCase();
              var idVal = String(memVals[k][1]).trim().toLowerCase();
              if (idVal === qClean || nameVal === qClean || nameVal.indexOf(qClean) !== -1) {
                targetId = memVals[k][1];
                targetName = memVals[k][0];
                break;
              }
            }
          }
          
          var colNguoiPhuTrach = getColumnIndexByHeader(sEv, "Người phụ trách");
          var colStatus = getColumnIndexByHeader(sEv, "Trạng thái");
          var colLanNhacCuoi = getColumnIndexByHeader(sEv, "Lần nhắc cuối");
          var colSoLanNhac = getColumnIndexByHeader(sEv, "Số lần nhắc");
          var colLichSu = getColumnIndexByHeader(sEv, "Lịch sử cập nhật");
          var colTaskId = getColumnIndexByHeader(sEv, "Task ID");
          
          var taskId = colTaskId !== -1 ? String(sEv.getRange(rowIndex, colTaskId).getValue()).trim() : "";
          var oldStatus = colStatus !== -1 ? String(sEv.getRange(rowIndex, colStatus).getValue()).trim() : "";
          
          if (colNguoiPhuTrach !== -1) sEv.getRange(rowIndex, colNguoiPhuTrach).setValue(targetId);
          if (colStatus !== -1) sEv.getRange(rowIndex, colStatus).setValue("Chờ xác nhận");
          if (colLanNhacCuoi !== -1) sEv.getRange(rowIndex, colLanNhacCuoi).setValue("");
          if (colSoLanNhac !== -1) sEv.getRange(rowIndex, colSoLanNhac).setValue(0);
          
          var existingHistory = colLichSu !== -1 ? sEv.getRange(rowIndex, colLichSu).getValue() : "";
          var newHistory = name + " giao lại việc cho " + targetName + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
          if (colLichSu !== -1) sEv.getRange(rowIndex, colLichSu).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
          
          appendTaskLog(taskId, "Giao lại việc", oldStatus, "Chờ xác nhận", name + " giao lại việc cho " + targetName);
          
          sendLineReply(event.replyToken, "🔄 Đã giao lại công việc dòng " + rowIndex + " cho " + targetName + "!");
          checkAndSendLineMessage();
        } else {
          sendLineReply(event.replyToken, "❌ Dòng công việc " + rowIndex + " không tồn tại hoặc không hợp lệ!");
        }
      } catch (e) {
        sendLineReply(event.replyToken, "❌ Lỗi khi giao lại việc: " + e.toString());
      }
    } else {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền giao lại công việc này!");
    }
    return true;
  }
  
  // 15. Tra cứu Chatbot
  var sChat = ss.getSheetByName("Chatbot");
  if (sChat) {
    var cData = sChat.getDataRange().getValues();
    for (var k = 1; k < cData.length; k++) {
      if (String(cData[k][0]).trim().toLowerCase() === cmd) {
        sendBotReply(event.replyToken, cData[k][1], cData[k][2]);
        return true;
      }
    }
  }
  
  return false;
}


// ==========================================
// TÍNH NĂNG BÁO CÁO VẬN HÀNH QUẢN LÝ CÔNG VIỆC MỚI
// ==========================================

function pushMessages(to, messages, logName) {
  if (!to) {
    writeLog("Không có địa chỉ nhận (to), không thể push.", "ERROR", "pushMessages");
    return;
  }
  var payload = {
    to: to,
    messages: messages
  };
  try {
    callLineApi("message/push", {
      method: "post",
      headers: {
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }, logName || "LINE push");
  } catch (e) {
    writeLog("Lỗi pushMessages: " + e.toString(), "ERROR", "pushMessages");
  }
}

function SETUP_TRIGGERS() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var func = triggers[i].getHandlerFunction();
    if (func === 'checkAndSendLineMessage' || func === 'guiBaoCaoCuoiNgayTuDong' || func === 'guiBaoCaoTuanTuDong') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 1. Trigger quét việc (mỗi phút)
  ScriptApp.newTrigger('checkAndSendLineMessage')
      .timeBased()
      .everyMinutes(1)
      .create();
      
  // 2. Trigger báo cáo ngày (mặc định đọc từ Settings hoặc là 21:00)
  var targetHour = 21;
  try {
    var ss = getSpreadsheet();
    var sSet = ss.getSheetByName("Settings");
    if (sSet) {
      var setData = sSet.getDataRange().getValues();
      for (var j = 1; j < setData.length; j++) {
        if (String(setData[j][0]).trim().toLowerCase() === "giờ báo cáo cuối ngày") {
          var val = String(setData[j][1]).trim();
          var parts = val.split(":");
          if (parts.length > 0) {
            var h = parseInt(parts[0], 10);
            if (!isNaN(h) && h >= 0 && h < 24) {
              targetHour = h;
            }
          }
          break;
        }
      }
    }
  } catch (err) {}
  
  ScriptApp.newTrigger('guiBaoCaoCuoiNgayTuDong')
      .timeBased()
      .everyDays(1)
      .atHour(targetHour)
      .nearMinute(0)
      .create();
      
  // 3. Trigger báo cáo tuần (tối Chủ Nhật lúc 20:00)
  ScriptApp.newTrigger('guiBaoCaoTuanTuDong')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(20)
      .create();
      
  writeLog("Đã đồng bộ thành công các Trình kích hoạt (Nhắc việc: 1 phút, Báo cáo ngày: " + targetHour + "h, Báo cáo tuần: CN 20h)", "INFO");
}

function guiBaoCaoCuoiNgayTuDong() {
  var ss = getSpreadsheet();
  var sGroup = ss.getSheetByName("ID_Group");
  if (!sGroup) return;
  
  var groupData = sGroup.getDataRange().getValues();
  var groupsSent = 0;
  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  for (var i = 1; i < groupData.length; i++) {
    var gName = String(groupData[i][0]).trim();
    var gId = String(groupData[i][1]).trim();
    if (!gId) continue;
    
    // 1. Tạo Flex báo cáo cuối ngày
    var flex = buildBaoCaoCuoiNgayFlexMessage(gId);
    
    // 2. Lưu lịch sử vào Daily_Report
    try {
      var sRep = ss.getSheetByName("Daily_Report");
      if (sRep) {
        var tasks = getActiveTasksList();
        var total = 0, completed = 0, doing = 0, support = 0, pending = 0, overdue = 0;
        for (var j = 0; j < tasks.length; j++) {
          var row = tasks[j];
          if (String(row[0]).trim() === "") continue;
          if (String(row[5] || "").trim() !== gId) continue;
          
          total++;
          var status = String(row[11] || "").trim();
          if (status === "Đã gửi") completed++;
          else if (status === "Quá hạn") overdue++;
          else if (status === "Cần hỗ trợ") support++;
          else if (status === "Đang làm") doing++;
          else pending++;
        }
        var rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        var colNgay = getColumnIndexByHeader(sRep, "Ngày");
        var colGroupId = getColumnIndexByHeader(sRep, "Group ID");
        var colTong = getColumnIndexByHeader(sRep, "Tổng việc");
        var colDaXong = getColumnIndexByHeader(sRep, "Đã xong");
        var colChuaXong = getColumnIndexByHeader(sRep, "Chưa xong");
        var colQuaHan = getColumnIndexByHeader(sRep, "Quá hạn");
        var colCanHoTro = getColumnIndexByHeader(sRep, "Cần hỗ trợ");
        var colNoiDung = getColumnIndexByHeader(sRep, "Nội dung báo cáo");
        
        if (colNgay !== -1 || colGroupId !== -1) {
          var maxCol = Math.max(sRep.getLastColumn(), 8);
          var rowData = new Array(maxCol);
          for (var k = 0; k < maxCol; k++) {
            rowData[k] = "";
          }
          if (colNgay !== -1) rowData[colNgay - 1] = todayStr;
          if (colGroupId !== -1) rowData[colGroupId - 1] = gId;
          if (colTong !== -1) rowData[colTong - 1] = total;
          if (colDaXong !== -1) rowData[colDaXong - 1] = completed;
          if (colChuaXong !== -1) rowData[colChuaXong - 1] = (total - completed);
          if (colQuaHan !== -1) rowData[colQuaHan - 1] = overdue;
          if (colCanHoTro !== -1) rowData[colCanHoTro - 1] = support;
          if (colNoiDung !== -1) rowData[colNoiDung - 1] = rate + "% (" + completed + "/" + total + ")";
          sRep.appendRow(rowData);
        } else {
          // Fallback to old 10-column style if headers are not updated
          sRep.appendRow([todayStr, gId, gName, total, completed, doing, support, pending, overdue, rate + "%"]);
        }
      }
    } catch (saveErr) {
      writeLog("Lỗi lưu báo cáo ngày vào sheet: " + saveErr.toString(), "WARNING");
    }
    
    // 3. Gửi đến nhóm
    try {
      pushMessages(gId, [flex], "Báo cáo cuối ngày tự động nhóm " + gName);
      groupsSent++;
    } catch (pushErr) {
      writeLog("Lỗi gửi báo cáo cuối ngày nhóm " + gName + ": " + pushErr.toString(), "ERROR");
    }
  }
  writeLog("Đã chạy báo cáo cuối ngày tự động. Đã gửi thành công cho " + groupsSent + " nhóm.", "INFO");
}

function guiBaoCaoTuanTuDong() {
  var ss = getSpreadsheet();
  var sGroup = ss.getSheetByName("ID_Group");
  if (!sGroup) return;
  
  var groupData = sGroup.getDataRange().getValues();
  var groupsSent = 0;
  for (var i = 1; i < groupData.length; i++) {
    var gName = String(groupData[i][0]).trim();
    var gId = String(groupData[i][1]).trim();
    if (!gId) continue;
    
    var flex = buildBaoCaoViec7NgayFlexMessage(gId);
    flex.altText = "Báo cáo tuần tự động";
    
    try {
      pushMessages(gId, [flex], "Báo cáo tuần tự động nhóm " + gName);
      groupsSent++;
    } catch (pushErr) {
      writeLog("Lỗi gửi báo cáo tuần tự động nhóm " + gName + ": " + pushErr.toString(), "ERROR");
    }
  }
  writeLog("Đã chạy báo cáo tuần tự động. Đã gửi thành công cho " + groupsSent + " nhóm.", "INFO");
}

function buildBaoCaoViecHomNayFlexMessage(gId) {
  var tasks = getActiveTasksList();
  var tz = Session.getScriptTimeZone();
  var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  
  var total = 0;
  var completed = 0;
  var pending = 0;
  var overdue = 0;
  var support = 0;
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    if (String(row[0]).trim() === "") continue;
    
    var idG = String(row[5] || "").trim();
    if (gId && idG !== gId) continue;
    
    var dateVal = null;
    if (row[15]) dateVal = convertToDate(row[15]);
    if (!dateVal && row[2]) dateVal = convertToDate(row[2]);
    
    if (dateVal) {
      var dateStr = Utilities.formatDate(dateVal, tz, "yyyy-MM-dd");
      if (dateStr === todayStr) {
        total++;
        var status = String(row[11] || "").trim();
        if (status === "Đã gửi") completed++;
        else if (status === "Quá hạn") overdue++;
        else if (status === "Cần hỗ trợ") support++;
        else if (status === "Đã hủy") {
          total--;
        } else pending++;
      }
    }
  }
  
  var groupLabel = "Tất cả nhóm";
  if (gId) {
    try { groupLabel = getGroupName(gId); } catch (e) {}
  }
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3B82F6",
      paddingAll: "12px",
      contents: [
        { type: "text", text: "📅 BÁO CÁO CÔNG VIỆC HÔM NAY", color: "#FFFFFF", weight: "bold", size: "sm" },
        { type: "text", text: "Phạm vi: " + groupLabel, color: "#DBEAFE", size: "xxs", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "14px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "📊 Tổng số việc hôm nay", size: "xs", color: "#333333", flex: 7 },
                { type: "text", text: String(total), size: "xs", weight: "bold", color: "#333333", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "✅ Đã hoàn tất", size: "xs", color: "#10B981", flex: 7 },
                { type: "text", text: String(completed), size: "xs", weight: "bold", color: "#10B981", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "⚡ Chưa hoàn thành", size: "xs", color: "#3B82F6", flex: 7 },
                { type: "text", text: String(pending), size: "xs", weight: "bold", color: "#3B82F6", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🆘 Cần hỗ trợ", size: "xs", color: "#7B61FF", flex: 7 },
                { type: "text", text: String(support), size: "xs", weight: "bold", color: "#7B61FF", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "⚠️ Quá hạn hôm nay", size: "xs", color: "#EF4444", flex: 7 },
                { type: "text", text: String(overdue), size: "xs", weight: "bold", color: "#EF4444", flex: 3, align: "end" }
              ]
            }
          ]
        },
        { type: "separator" },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: "Tỷ lệ hoàn thành: " + (total > 0 ? Math.round((completed / total) * 100) : 0) + "%",
              size: "xs",
              weight: "bold",
              color: "#3B82F6"
            }
          ]
        }
      ]
    }
  };
  
  return {
    type: "flex",
    altText: "Báo cáo công việc hôm nay",
    contents: bubble
  };
}

function buildBaoCaoViec7NgayFlexMessage(gId) {
  var tasks = getActiveTasksList();
  
  var now = new Date();
  var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  var startOfRange = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
  var endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1000);
  
  var total = 0;
  var completed = 0;
  var completionCounts = {};
  var overdueTasks = [];
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    if (String(row[0]).trim() === "") continue;
    
    var idG = String(row[5] || "").trim();
    if (gId && idG !== gId) continue;
    
    var dateVal = null;
    if (row[15]) dateVal = convertToDate(row[15]);
    if (!dateVal && row[2]) dateVal = convertToDate(row[2]);
    
    if (dateVal && dateVal >= startOfRange && dateVal <= endOfToday) {
      total++;
      var status = String(row[11] || "").trim();
      
      if (status === "Đã gửi") {
        completed++;
        var idNVs = String(row[6] || "").split(",");
        idNVs.forEach(function(uId) {
          uId = uId.trim();
          if (uId) {
            completionCounts[uId] = (completionCounts[uId] || 0) + 1;
          }
        });
      } else if (status === "Quá hạn") {
        overdueTasks.push({
          name: row[0],
          assignee: resolveMemberNamesList(row[6]),
          deadline: row[15]
        });
      } else if (status === "Đã hủy") {
        total--;
      }
    }
  }
  
  var topPerformersList = [];
  for (var uId in completionCounts) {
    topPerformersList.push({ uId: uId, count: completionCounts[uId] });
  }
  topPerformersList.sort(function(a, b) { return b.count - a.count; });
  
  var topPerformersText = "Không có";
  if (topPerformersList.length > 0) {
    var topLines = topPerformersList.slice(0, 3).map(function(item, idx) {
      var name = resolveMemberName(item.uId, gId);
      return (idx + 1) + ". " + name + ": " + item.count + " việc";
    });
    topPerformersText = topLines.join("\n");
  }
  
  var overdueLines = [];
  if (overdueTasks.length === 0) {
    overdueLines.push({ type: "text", text: "✅ Không có việc trễ hạn trong 7 ngày qua.", size: "xxs", color: "#10B981" });
  } else {
    overdueTasks.slice(0, 5).forEach(function(t) {
      overdueLines.push({
        type: "text",
        text: "• " + t.name + " (" + t.assignee + ") - Hạn: " + (t.deadline ? formatDateTimeDisplay(t.deadline).split(" ")[0] : "N/A"),
        size: "xxs",
        color: "#EF4444",
        wrap: true
      });
    });
  }
  
  var groupLabel = "Tất cả nhóm";
  if (gId) {
    try { groupLabel = getGroupName(gId); } catch (e) {}
  }
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#6366F1",
      paddingAll: "12px",
      contents: [
        { type: "text", text: "📊 BÁO CÁO CÔNG VIỆC 7 NGÀY QUA", color: "#FFFFFF", weight: "bold", size: "sm" },
        { type: "text", text: "Phạm vi: " + groupLabel, color: "#E0E7FF", size: "xxs", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "14px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "📅 Tổng số việc 7 ngày", size: "xs", color: "#333333", flex: 7 },
                { type: "text", text: String(total), size: "xs", weight: "bold", color: "#333333", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🎉 Đã hoàn tất", size: "xs", color: "#10B981", flex: 7 },
                { type: "text", text: String(completed), size: "xs", weight: "bold", color: "#10B981", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "Tỷ lệ hoàn thành", size: "xs", color: "#6366F1", flex: 7 },
                { type: "text", text: (total > 0 ? Math.round((completed / total) * 100) : 0) + "%", size: "xs", weight: "bold", color: "#6366F1", flex: 3, align: "end" }
              ]
            }
          ]
        },
        { type: "separator" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            { type: "text", text: "🏆 TOP HOÀN THÀNH:", size: "xs", weight: "bold", color: "#6366F1" },
            { type: "text", text: topPerformersText, size: "xs", color: "#555555", wrap: true }
          ]
        },
        { type: "separator" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            { type: "text", text: "🚨 VIỆC QUÁ HẠN:", size: "xs", weight: "bold", color: "#EF4444" }
          ].concat(overdueLines)
        }
      ]
    }
  };
  
  return {
    type: "flex",
    altText: "Báo cáo công việc 7 ngày",
    contents: bubble
  };
}

function buildBaoCaoNhanVienFlexMessage(query, senderUId, gId) {
  var ss = getSpreadsheet();
  var sMem = ss.getSheetByName("ID_Member");
  var targetUId = senderUId;
  var targetName = getUserName(senderUId, gId);
  
  if (query && sMem) {
    var memVals = sMem.getDataRange().getValues();
    var qClean = query.trim().toLowerCase();
    for (var i = 1; i < memVals.length; i++) {
      var nameVal = String(memVals[i][0]).trim().toLowerCase();
      var idVal = String(memVals[i][1]).trim().toLowerCase();
      if (idVal === qClean || nameVal === qClean || nameVal.indexOf(qClean) !== -1) {
        targetUId = memVals[i][1];
        targetName = memVals[i][0];
        break;
      }
    }
  }
  
  var tasks = getActiveTasksList();
  var total = 0;
  var completed = 0;
  var late = 0;
  var activeTasks = [];
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    if (String(row[0]).trim() === "") continue;
    
    var idG = String(row[5] || "").trim();
    if (gId && idG !== gId) continue;
    
    var idNVs = String(row[6] || "").split(",").map(function(s) { return s.trim(); });
    if (idNVs.indexOf(targetUId) !== -1) {
      total++;
      var status = String(row[11] || "").trim();
      if (status === "Đã gửi") completed++;
      else if (status === "Quá hạn") {
        late++;
        activeTasks.push({ name: row[0], deadline: row[15], status: status });
      } else if (status === "Đã hủy") {
        total--;
      } else {
        activeTasks.push({ name: row[0], deadline: row[15], status: status });
      }
    }
  }
  
  var pendingLines = [];
  if (activeTasks.length === 0) {
    pendingLines.push({ type: "text", text: "🎉 Tuyệt vời! Không có công việc nào chưa hoàn thành.", size: "xxs", color: "#10B981" });
  } else {
    activeTasks.slice(0, 5).forEach(function(t) {
      var color = "#3B82F6";
      if (t.status === "Quá hạn") color = "#EF4444";
      else if (t.status === "Cần hỗ trợ") color = "#7B61FF";
      pendingLines.push({
        type: "text",
        text: "• " + t.name + " (Hạn: " + (t.deadline ? formatDateTimeDisplay(t.deadline).split(" ")[0] : "N/A") + ")",
        size: "xxs",
        color: color,
        wrap: true
      });
    });
  }
  
  var groupLabel = "Tất cả nhóm";
  if (gId) {
    try { groupLabel = getGroupName(gId); } catch (e) {}
  }
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#8B5CF6",
      paddingAll: "12px",
      contents: [
        { type: "text", text: "👤 HIỆU SUẤT NHÂN VIÊN", color: "#FFFFFF", weight: "bold", size: "sm" },
        { type: "text", text: "Họ tên: " + targetName + " | Nhóm: " + groupLabel, color: "#EDE9FE", size: "xxs", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "14px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "📊 Việc được giao", size: "xs", color: "#333333", flex: 7 },
                { type: "text", text: String(total), size: "xs", weight: "bold", color: "#333333", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🎉 Việc đã xong", size: "xs", color: "#10B981", flex: 7 },
                { type: "text", text: String(completed), size: "xs", weight: "bold", color: "#10B981", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "⚠️ Việc trễ hạn", size: "xs", color: "#EF4444", flex: 7 },
                { type: "text", text: String(late), size: "xs", weight: "bold", color: "#EF4444", flex: 3, align: "end" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "Tỷ lệ hoàn thành", size: "xs", color: "#8B5CF6", flex: 7 },
                { type: "text", text: (total > 0 ? Math.round((completed / total) * 100) : 0) + "%", size: "xs", weight: "bold", color: "#8B5CF6", flex: 3, align: "end" }
              ]
            }
          ]
        },
        { type: "separator" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            { type: "text", text: "⏳ VIỆC CHƯA HOÀN THÀNH (TỐI ĐA 5 VIỆC):", size: "xs", weight: "bold", color: "#8B5CF6" }
          ].concat(pendingLines)
        }
      ]
    }
  };
  
  return {
    type: "flex",
    altText: "Hiệu suất nhân viên " + targetName,
    contents: bubble
  };
}


function buildTaskSelectionFlex(tasks, msgId) {
  var contents = [
    {
      type: "text",
      text: "Bạn có nhiều công việc đang chờ gửi ảnh. Vui lòng bấm chọn đúng công việc dưới đây để nghiệm thu:",
      size: "xs",
      color: "#555555",
      wrap: true
    },
    {
      type: "separator",
      margin: "md"
    }
  ];

  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var actionData = "action=confirm_image&row=" + task.rowIndex + "&msgId=" + msgId;
    contents.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "xs",
      contents: [
        {
          type: "text",
          text: "📌 " + task.taskName,
          weight: "bold",
          size: "sm",
          color: "#333333",
          wrap: true
        },
        {
          type: "text",
          text: "ID: " + task.taskId + " | Hạn: " + (task.status === "Chờ gửi ảnh" ? "Chỉ gửi ảnh" : "Ảnh + Ghi chú"),
          size: "xxs",
          color: "#888888"
        },
        {
          type: "button",
          style: "primary",
          color: "#1DB446",
          height: "sm",
          margin: "xs",
          action: {
            type: "postback",
            label: "Nghiệm thu việc này",
            data: actionData,
            displayText: "Nghiệm thu việc: " + task.taskName
          }
        }
      ]
    });
  }

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1DB446",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "📸 CHỌN VIỆC NGHIỆM THU",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "14px",
      contents: contents
    }
  };

  return {
    type: "flex",
    altText: "Chọn việc cần nghiệm thu ảnh",
    contents: bubble
  };
}

// ==========================================
// CÁC HÀM CẤU HÌNH VÀ VẬN HÀNH CHO GOOGLE SHEETS MENU
// ==========================================

function CHAY_KIEM_TRA_SUC_KHOE_BOT() {
  var report = "🏥 KẾT QUẢ KIỂM TRA SỨC KHỎE BOT:\n\n";
  var ui = SpreadsheetApp.getUi();
  var ok = true;
  
  // 1. Kiểm tra các sheet có đủ không
  var ss = getSpreadsheet();
  var sheetsToCheck = ["Sự kiện", "Settings", "User_Roles", "Task_Logs", "Task_Comments", "ID_Group", "ID_Member", "Logs"];
  var sheetsStatus = [];
  sheetsToCheck.forEach(function(s) {
    var found = ss.getSheetByName(s) !== null;
    sheetsStatus.push(s + ": " + (found ? "✅ OK" : "❌ Thiếu"));
    if (!found) ok = false;
  });
  report += "1. Cấu trúc Google Sheets:\n" + sheetsStatus.join("\n") + "\n\n";
  
  // 2. Kiểm tra token & properties
  var token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  var liffId = PropertiesService.getScriptProperties().getProperty("LIFF_ID") || getSetting("LIFF_ID", "");
  var admins = PropertiesService.getScriptProperties().getProperty("ADMIN_USER_IDS") || getSetting("ADMIN_USER_IDS", "");
  
  report += "2. Cấu hình hệ thống:\n";
  report += "- LINE Access Token: " + (token ? "✅ Đã thiết lập (" + token.substring(0, 8) + "...)" : "❌ CHƯA CÓ TOKEN") + "\n";
  if (!token) ok = false;
  report += "- LIFF ID: " + (liffId ? "✅ Đã thiết lập (" + liffId + ")" : "❌ CHƯA CÓ LIFF ID") + "\n";
  if (!liffId) ok = false;
  report += "- Admin User IDs: " + (admins ? "✅ Đã thiết lập (" + admins + ")" : "⚠️ Chưa thiết lập ADMIN_USER_IDS (Dùng admin mặc định)") + "\n\n";
  
  // 3. Kiểm tra kết nối LINE API
  report += "3. Kết nối LINE API:\n";
  if (token) {
    try {
      var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/user/all/richmenu", {
        headers: { Authorization: "Bearer " + token },
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code === 200) {
        report += "✅ Kết nối LINE API thành công (HTTP 200)\n\n";
      } else {
        report += "❌ LINE API trả về mã lỗi HTTP " + code + ": " + res.getContentText() + "\n\n";
        ok = false;
      }
    } catch (err) {
      report += "❌ Không thể kết nối tới LINE API: " + err.toString() + "\n\n";
      ok = false;
    }
  } else {
    report += "❌ Bỏ qua kiểm tra kết nối vì thiếu Token.\n\n";
  }
  
  // 4. Kiểm tra Trình kích hoạt (Triggers)
  var triggers = ScriptApp.getProjectTriggers();
  var triggerNames = triggers.map(function(t) { return t.getHandlerFunction(); });
  var expectedTriggers = ["checkAndSendLineMessage", "guiBaoCaoCuoiNgayTuDong", "guiBaoCaoTuanTuDong"];
  var triggersReport = [];
  expectedTriggers.forEach(function(et) {
    var active = triggerNames.indexOf(et) !== -1;
    triggersReport.push("- " + et + ": " + (active ? "✅ Đang chạy" : "❌ Thiếu"));
    if (!active) ok = false;
  });
  report += "4. Trình kích hoạt (Triggers):\n" + triggersReport.join("\n") + "\n\n";
  
  if (ok) {
    report += "🎉 TỔNG KẾT: HỆ THỐNG HOẠT ĐỘNG HOÀN HẢO!";
    ui.alert("🏥 Sức khỏe Bot: TỐT", report, ui.ButtonSet.OK);
  } else {
    report += "⚠️ TỔNG KẾT: PHÁT HIỆN LỖI/CẢNH BÁO. Vui lòng khắc phục theo hướng dẫn trên.";
    ui.alert("🏥 Sức khỏe Bot: CẢNH BÁO", report, ui.ButtonSet.OK);
  }
}

function DON_DEP_LOGS_MENU() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert("🧹 Xác nhận dọn dẹp log", "Bạn có chắc chắn muốn xóa toàn bộ lịch sử Logs không?", ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;
  
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Logs");
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        sheet.deleteRows(2, lastRow - 1);
      }
    }
    writeLog("Lịch sử log đã được dọn dẹp bởi quản trị viên từ Google Sheet.", "INFO", "DON_DEP_LOGS_MENU");
    ui.alert("✅ Đã dọn dẹp toàn bộ Logs thành công!");
  } catch (e) {
    ui.alert("❌ Lỗi khi dọn log: " + e.toString());
  }
}

function XEM_CAU_HINH_MENU() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var report = "⚙️ CẤU HÌNH SCRIPT PROPERTIES HIỆN TẠI:\n\n";
  for (var k in props) {
    var val = props[k];
    if (k.indexOf("TOKEN") !== -1) {
      val = val ? val.substring(0, 10) + "..." : "Trống";
    }
    report += "- " + k + ": " + val + "\n";
  }
  SpreadsheetApp.getUi().alert("Xem Cấu hình", report, SpreadsheetApp.getUi().ButtonSet.OK);
}

function setScriptPropertyWithBackup(key, value) {
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperty(key);
  if (current && current !== value) {
    props.setProperty("BACKUP_" + key, current);
  }
  props.setProperty(key, value);
}

function CAP_NHAT_TOKEN_MENU() {
  var ui = SpreadsheetApp.getUi();
  var input = ui.prompt(
    "🔑 Cập nhật LINE Channel Access Token",
    "Dán LINE Channel Access Token mới vào đây (không chứa dấu cách thừa):",
    ui.ButtonSet.OK_CANCEL
  );
  if (input.getSelectedButton() !== ui.Button.OK) return;
  
  var token = input.getResponseText().trim();
  if (!token) {
    ui.alert("❌ Token không được để trống.");
    return;
  }
  
  try {
    setScriptPropertyWithBackup("LINE_CHANNEL_ACCESS_TOKEN", token);
    
    // Kiểm tra kết nối lập tức
    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/user/all/richmenu", {
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 200) {
      ui.alert("✅ Cập nhật thành công! LINE Token hợp lệ và đã kết nối được LINE API.");
      writeLog("Đã cập nhật LINE Channel Access Token thành công.", "INFO", "CAP_NHAT_TOKEN_MENU");
    } else {
      ui.alert("⚠️ Đã lưu Token, nhưng LINE API báo lỗi HTTP " + code + ": " + res.getContentText() + "\nHãy kiểm tra lại Token của bạn.");
      writeLog("Đã cập nhật LINE Token nhưng kết nối LINE API thất bại (HTTP " + code + ").", "WARNING", "CAP_NHAT_TOKEN_MENU");
    }
  } catch (e) {
    ui.alert("⚠️ Đã lưu Token, nhưng không kiểm tra được kết nối: " + e.toString());
    writeLog("Đã cập nhật LINE Token, lỗi kiểm tra kết nối: " + e.toString(), "WARNING", "CAP_NHAT_TOKEN_MENU");
  }
}

function CAP_NHAT_LIFF_ID_MENU() {
  var ui = SpreadsheetApp.getUi();
  var current = PropertiesService.getScriptProperties().getProperty("LIFF_ID") || "2010371497-R9x4l665";
  var input = ui.prompt(
    "📱 Cập nhật LIFF ID",
    "Nhập LIFF ID mới (hiện tại: " + current + "):",
    ui.ButtonSet.OK_CANCEL
  );
  if (input.getSelectedButton() !== ui.Button.OK) return;
  
  var liffId = input.getResponseText().trim();
  if (!liffId) {
    ui.alert("❌ LIFF ID không được để trống.");
    return;
  }
  
  setScriptPropertyWithBackup("LIFF_ID", liffId);
  ui.alert("✅ Đã cập nhật LIFF ID thành công!\nLIFF URL mới: https://liff.line.me/" + liffId);
  writeLog("Đã cập nhật LIFF ID thành: " + liffId, "INFO", "CAP_NHAT_LIFF_ID_MENU");
}

function CAP_NHAT_ADMIN_USER_IDS_MENU() {
  var ui = SpreadsheetApp.getUi();
  var current = PropertiesService.getScriptProperties().getProperty("ADMIN_USER_IDS") || "";
  var input = ui.prompt(
    "👥 Cập nhật Admin User IDs",
    "Nhập danh sách Admin User ID, phân tách bằng dấu phẩy (ví dụ: U123,U456):",
    ui.ButtonSet.OK_CANCEL
  );
  if (input.getSelectedButton() !== ui.Button.OK) return;
  
  var admins = input.getResponseText().trim();
  setScriptPropertyWithBackup("ADMIN_USER_IDS", admins);
  ui.alert("✅ Đã cập nhật Admin User IDs thành công!");
  writeLog("Đã cập nhật Admin User IDs thành: " + admins, "INFO", "CAP_NHAT_ADMIN_USER_IDS_MENU");
}

function ROLLBACK_CAU_HINH_MENU() {
  var props = PropertiesService.getScriptProperties();
  var keys = ["LINE_CHANNEL_ACCESS_TOKEN", "LIFF_ID", "ADMIN_USER_IDS"];
  var rolledBack = [];
  
  keys.forEach(function(key) {
    var backup = props.getProperty("BACKUP_" + key);
    if (backup !== null) {
      var current = props.getProperty(key) || "";
      props.setProperty(key, backup);
      props.setProperty("BACKUP_" + key, current); // Hoán đổi cấu hình hiện tại thành bản backup mới
      rolledBack.push(key);
    }
  });
  
  var ui = SpreadsheetApp.getUi();
  if (rolledBack.length > 0) {
    ui.alert("✅ Đã khôi phục thành công các cấu hình (Rollback): " + rolledBack.join(", "));
    writeLog("Đã khôi phục cấu hình (Rollback) cho: " + rolledBack.join(", "), "INFO", "ROLLBACK_CAU_HINH_MENU");
  } else {
    ui.alert("ℹ️ Không tìm thấy cấu hình sao lưu nào để khôi phục.");
  }
}
