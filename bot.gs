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
  // Tự động cấu hình LIFF ID của bạn vào hệ thống nếu chưa có hoặc đang dùng ID cũ
  var props = PropertiesService.getScriptProperties();
  var currentLiff = props.getProperty('LIFF_ID');
  if (!currentLiff || currentLiff === '2010231412-AYj2xgdU') {
    props.setProperty('LIFF_ID', '2010371497-R9x4l665');
  }
  
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 LINE BOT')
      .addItem('🩺 Kiểm tra sức khỏe bot', 'CHAY_KIEM_TRA_SUC_KHOE_BOT')
      .addItem('🔄 Tạo lại trigger', 'SETUP_TRIGGERS')
      .addItem('🔄 Thiết lập trigger im lặng', 'setupSilentGroupTrigger')
      .addItem('🔄 Thiết lập trigger báo cáo EOD', 'setupDailyInteractionReportTrigger')
      .addItem('🧹 Dọn Logs', 'DON_DEP_LOGS_MENU')
      .addItem('⚙️ Xem cấu hình', 'XEM_CAU_HINH_MENU')
      .addItem('🔄 Khôi phục cấu hình (Rollback)', 'ROLLBACK_CAU_HINH_MENU')
      .addSeparator()
      .addItem('📊 Tạo Dashboard Tương Tác', 'SETUP_DASHBOARD_TUONG_TAC')
      .addItem('🔄 Cập nhật Dashboard Tương Tác', 'UPDATE_DASHBOARD_TUONG_TAC')
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
    
    var expectedHeaders = ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline", "Quote Token"];
    var actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
    
    var colTaskId = getColumnIndexByHeader(sheet, "Task ID");
    var colStatus = getColumnIndexByHeader(sheet, "Trạng thái");
    var colLichSu = getColumnIndexByHeader(sheet, "Lịch sử cập nhật");
    var colDaNhacPre = getColumnIndexByHeader(sheet, "Đã nhắc trước deadline");
    var colLanNhacCuoi = getColumnIndexByHeader(sheet, "Lần nhắc cuối");
    var colSoLanNhac = getColumnIndexByHeader(sheet, "Số lần nhắc");
    var colQuoteToken = getColumnIndexByHeader(sheet, "Quote Token");
    
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
        daNhacPreDeadline: row[22], // Cột 23 / Cột W
        quoteToken: row[23] // Cột 24 / Cột X
      };
      
      // 1. Kiểm tra QUÁ HẠN (Deadline)
      if (extraData.deadline) {
        var deadlineVal = convertToDate(extraData.deadline);
        if (deadlineVal && currentTime > deadlineVal && status !== "Quá hạn") {
          if (colStatus !== -1) sheet.getRange(rowIndex, colStatus).setValue("Quá hạn");
          
          var oldStatus = status;
          status = "Quá hạn";
          extraData.trangThaiChiTiet = "Quá hạn";
          
          if (idNV) {
            var nvIds = String(idNV).split(",").map(function(s) { return s.trim(); }).filter(Boolean);
            nvIds.forEach(function(nvId) {
              logInteraction({
                groupId: idG,
                userId: nvId,
                type: "task_overdue",
                content: "Quá hạn công việc: " + tenSuKien,
                taskId: taskId,
                source: "System",
                note: "Hệ thống tự động ghi nhận quá hạn"
              });
            });
          }
          
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
              var quoteToken = sendLinePush(idG, tenSuKien, row[1], hinhAnh, hinhThucXN, rowIndex, idNV, soLan, uuTien, extraData);
              if (quoteToken && colQuoteToken !== -1) {
                var currentQuoteTokenVal = sheet.getRange(rowIndex, colQuoteToken).getValue();
                if (!currentQuoteTokenVal) {
                  sheet.getRange(rowIndex, colQuoteToken).setValue(quoteToken);
                }
              }
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
            var quoteToken = sendLinePush(idG, tenSuKien, row[1], hinhAnh, "Không", rowIndex, idNV, soLan, uuTien, extraData);
            if (quoteToken && colQuoteToken !== -1) {
              var currentQuoteTokenVal = sheet.getRange(rowIndex, colQuoteToken).getValue();
              if (!currentQuoteTokenVal) {
                sheet.getRange(rowIndex, colQuoteToken).setValue(quoteToken);
              }
            }
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

function getDayIndices(lapLaiVal) {
  var days = [];
  var lower = String(lapLaiVal || "").toLowerCase();
  if (lower.includes("thứ 2") || lower.includes("t2")) days.push(1);
  if (lower.includes("thứ 3") || lower.includes("t3")) days.push(2);
  if (lower.includes("thứ 4") || lower.includes("t4")) days.push(3);
  if (lower.includes("thứ 5") || lower.includes("t5")) days.push(4);
  if (lower.includes("thứ 6") || lower.includes("t6")) days.push(5);
  if (lower.includes("thứ 7") || lower.includes("t7")) days.push(6);
  if (lower.includes("chủ nhật") || lower.includes("cn")) days.push(0);
  return days;
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
  
  var lapLaiVal = String(getVal("Lặp lại") || "Không").trim();
  var originalD = new Date(d.getTime());
  var days = getDayIndices(lapLaiVal);
  if (days.length > 0) {
    var found = false;
    for (var step = 1; step <= 7; step++) {
      var nextD = new Date(originalD.getTime());
      nextD.setDate(nextD.getDate() + step);
      if (days.indexOf(nextD.getDay()) !== -1) {
        d = nextD;
        found = true;
        break;
      }
    }
  } else {
    if (lapLaiVal === "Hàng giờ") {
      d.setHours(d.getHours() + 1);
    } else if (lapLaiVal === "Hàng ngày") {
      d.setDate(d.getDate() + 1);
    } else if (lapLaiVal === "Hàng tuần") {
      d.setDate(d.getDate() + 7);
    } else if (/Cuối tháng - (\d+) ngày/i.test(lapLaiVal) || /trước (\d+) ngày cuối tháng/i.test(lapLaiVal) || /Trước ngày cuối tháng: (\d+)/i.test(lapLaiVal)) {
      var match = lapLaiVal.match(/Cuối tháng - (\d+) ngày/i) || lapLaiVal.match(/trước (\d+) ngày cuối tháng/i) || lapLaiVal.match(/Trước ngày cuối tháng: (\d+)/i);
      var daysBefore = parseInt(match[1], 10);
      d = new Date(originalD.getFullYear(), originalD.getMonth() + 2, 0);
      var offset = daysBefore - 1;
      if (offset < 0) offset = 0;
      d.setDate(d.getDate() - offset);
      d.setHours(originalD.getHours(), originalD.getMinutes(), originalD.getSeconds(), originalD.getMilliseconds());
    } else if (lapLaiVal.indexOf("Cuối tháng") !== -1 || lapLaiVal.indexOf("ngày cuối cùng của tháng") !== -1) {
      d = new Date(originalD.getFullYear(), originalD.getMonth() + 2, 0);
      d.setHours(originalD.getHours(), originalD.getMinutes(), originalD.getSeconds(), originalD.getMilliseconds());
    }
  }
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
          
          // Ghi log tương tác tin nhắn văn bản / sticker
          if (gId && (msgType === "text" || msgType === "sticker")) {
            var interactionType = getInteractionTypeFromEvent(event);
            logInteraction({
              groupId: gId,
              userId: uId,
              type: interactionType,
              content: summarizeMessageContent(event),
              source: "Webhook"
            });
          }
          
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
              var colTenSuKien = getColumnIndexByHeader(sEv, "Tên sự kiện");
              
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
                    
                    // Ghi log tương tác task_completed
                    logInteraction({
                      groupId: gId,
                      userId: uId,
                      type: "task_completed",
                      content: "Hoàn tất việc qua ghi chú nghiệm thu: " + (colTenSuKien !== -1 ? evData[j][colTenSuKien - 1] : "Công việc"),
                      taskId: taskId,
                      source: "Webhook"
                    });
                    
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
                  
                  // Ghi log tương tác image_proof và task_completed
                  logInteraction({
                    groupId: gId,
                    userId: uId,
                    type: "image_proof",
                    content: "Gửi ảnh nghiệm thu: " + task.taskName,
                    taskId: task.taskId,
                    source: "Webhook"
                  });
                  logInteraction({
                    groupId: gId,
                    userId: uId,
                    type: "task_completed",
                    content: "Nghiệm thu ảnh hoàn tất việc: " + task.taskName,
                    taskId: task.taskId,
                    source: "Webhook"
                  });
                  
                  sendLineReply(event.replyToken, "📸 Đã nghiệm thu ảnh cho việc: " + task.taskName); 
                } else if (task.status === "Chờ gửi ảnh + ghi chú") {
                  sEv.getRange(task.rowIndex, colStatus).setValue("Chờ ghi chú nghiệm thu"); 
                  if (colAnhNT !== -1) sEv.getRange(task.rowIndex, colAnhNT).setValue(imgUrl);
                  
                  var history = "Đã gửi ảnh bởi " + name + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm") + ". Đang chờ ghi chú.";
                  if (colLichSu !== -1) sEv.getRange(task.rowIndex, colLichSu).setValue(history);
                  
                  appendTaskLog(task.taskId, "Đổi trạng thái", task.status, "Chờ ghi chú nghiệm thu", "Gửi ảnh thành công, chờ gửi tiếp ghi chú (tự động)");
                  
                  // Ghi log tương tác image_proof
                  logInteraction({
                    groupId: gId,
                    userId: uId,
                    type: "image_proof",
                    content: "Gửi ảnh nghiệm thu: " + task.taskName,
                    taskId: task.taskId,
                    source: "Webhook"
                  });
                  
                  sendLineReply(event.replyToken, "✅ Đã nhận ảnh nghiệm thu cho việc: " + task.taskName + "\nVui lòng gửi tiếp một tin nhắn văn bản làm Ghi chú nghiệm thu.");
                }
              } else {
                // Ghi log tương tác ảnh thường
                logInteraction({
                  groupId: gId,
                  userId: uId,
                  type: "image",
                  content: summarizeMessageContent(event),
                  source: "Webhook"
                });
                
                if (matchingTasks.length > 1) {
                  var flexMsg = buildTaskSelectionFlex(matchingTasks, event.message.id);
                  replyMessages(event.replyToken, [flexMsg], "LINE select task flex reply");
                }
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
          var uId = event.source.userId;
          var gId = event.source.groupId;
          var uName = getUserName(uId, gId);
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
                  
                  // Ghi log tương tác confirm_image (image_proof + task_completed)
                  logInteraction({
                    groupId: gId,
                    userId: uId,
                    type: "image_proof",
                    content: "Gửi ảnh nghiệm thu qua postback: " + taskName,
                    taskId: taskId,
                    source: "Webhook"
                  });
                  logInteraction({
                    groupId: gId,
                    userId: uId,
                    type: "task_completed",
                    content: "Nghiệm thu ảnh hoàn tất việc: " + taskName,
                    taskId: taskId,
                    source: "Webhook"
                  });
                  
                  sendLineReply(event.replyToken, "📸 Đã nghiệm thu ảnh thành công cho việc: " + taskName); 
                } else if (currentStatus === "Chờ gửi ảnh + ghi chú") {
                  sEv.getRange(rIdx, colStatus).setValue("Chờ ghi chú nghiệm thu"); 
                  if (colAnhNT !== -1) sEv.getRange(rIdx, colAnhNT).setValue(imgUrl);
                  if (colXN !== -1) sEv.getRange(rIdx, colXN).setValue(uName);
                  
                  var history = "Đã gửi ảnh bởi " + uName + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "dd-MM-yyyy HH:mm") + ". Đang chờ ghi chú.";
                  if (colLichSu !== -1) sEv.getRange(rIdx, colLichSu).setValue(history);
                  
                  appendTaskLog(taskId, "Đổi trạng thái", currentStatus, "Chờ ghi chú nghiệm thu", "Gửi ảnh thành công, chờ gửi tiếp ghi chú (qua postback)");
                  
                  // Ghi log tương tác confirm_image (image_proof)
                  logInteraction({
                    groupId: gId,
                    userId: uId,
                    type: "image_proof",
                    content: "Gửi ảnh nghiệm thu qua postback: " + taskName,
                    taskId: taskId,
                    source: "Webhook"
                  });
                  
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
                
                // Ghi log tương tác hoantat (postback_hoantat + task_completed)
                logInteraction({
                  groupId: gId,
                  userId: uId,
                  type: "postback_hoantat",
                  content: "Bấm hoàn tất việc: " + taskName,
                  taskId: taskId,
                  source: "Webhook"
                });
                logInteraction({
                  groupId: gId,
                  userId: uId,
                  type: "task_completed",
                  content: "Hoàn tất việc: " + taskName,
                  taskId: taskId,
                  source: "Webhook"
                });
                
                sendLineReply(event.replyToken, "🎉 " + uName + " đã xong!");
              } else if (d.includes("action=chupanh_ghichu") || d.includes("action=chupanh")) {
                var newStat = d.includes("action=chupanh_ghichu") ? "Chờ gửi ảnh + ghi chú" : "Chờ gửi ảnh";
                var label = d.includes("action=chupanh_ghichu") ? "Người nhận chọn Hoàn tất chụp ảnh + ghi chú" : "Người nhận chọn Hoàn tất chụp ảnh";
                var replyTxt = d.includes("action=chupanh_ghichu") ? "📸 Mời bạn gửi ảnh nghiệm thu trước." : "📸 Mời bạn gửi ảnh!";
                
                if (colXN !== -1) sEv.getRange(rIdx, colXN).setValue(uName); 
                sEv.getRange(rIdx, colStatus).setValue(newStat);
                appendTaskLog(taskId, "Đổi trạng thái", currentStatus, newStat, label);
                
                // Ghi log tương tác postback_chupanh
                logInteraction({
                  groupId: gId,
                  userId: uId,
                  type: "postback_chupanh",
                  content: "Chọn hoàn tất bằng chụp ảnh: " + taskName,
                  taskId: taskId,
                  source: "Webhook"
                });
                
                sendLineReply(event.replyToken, replyTxt);
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
                
                // Ghi log tương tác support (postback_can_hotro + task_help_needed)
                logInteraction({
                  groupId: gId,
                  userId: uId,
                  type: "postback_can_hotro",
                  content: "Báo cần hỗ trợ: " + taskName,
                  taskId: taskId,
                  source: "Webhook"
                });
                logInteraction({
                  groupId: gId,
                  userId: uId,
                  type: "task_help_needed",
                  content: "Cần hỗ trợ: " + taskName,
                  taskId: taskId,
                  source: "Webhook"
                });
                
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
                
                // Ghi log tương tác delay (postback_doi_han)
                logInteraction({
                  groupId: gId,
                  userId: uId,
                  type: "postback_doi_han",
                  content: "Dời hạn công việc: " + taskName + " (" + delayText + ")",
                  taskId: taskId,
                  source: "Webhook"
                });
                
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
  
  // 1. Kiểm tra mã trích dẫn (Quote Token) từ công việc đã gửi trước đó
  var quoteToken = (extraData && extraData.quoteToken) ? String(extraData.quoteToken).trim() : "";
  
  // 2. Thiết lập nội dung text cảnh báo/nhắc nhở
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

  if (quoteToken) {
    // Chế độ Trả lời trích dẫn (Quote Reply) - chỉ gửi 1 tin nhắn text trích dẫn, tránh spam
    var msgObj;
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
      msgObj = {
        "type": "textV2",
        "text": textParts.join(" ") + " " + alertTxt,
        "substitution": substitution,
        "quoteToken": quoteToken
      };
    } else {
      msgObj = {
        "type": "text",
        "text": alertTxt,
        "quoteToken": quoteToken
      };
    }
    msgs.push(msgObj);
  } else {
    // Chế độ Bình thường (Gửi lần đầu, hoặc khi chưa có Quote Token)
    // 1. Xử lý Ảnh
    var cleanImg = String(img).trim();
    if (cleanImg !== "" && cleanImg.startsWith("http")) {
      msgs.push({"type": "image", "originalContentUrl": cleanImg, "previewImageUrl": cleanImg});
    }
    
    // 2. Xử lý Tag đích danh (Sử dụng tin nhắn textV2 với substitution hỗ trợ đa thành viên)
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
  }
  
  var payload = { "to": to, "messages": msgs };
  var res = callLineApi("message/push", {
    method: "post",
    headers: {
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  }, "Gửi tin nhắn việc mới (Push)");
  
  if (res) {
    try {
      var body = JSON.parse(res.getContentText());
      if (body && body.sentMessages && body.sentMessages.length > 0) {
        for (var i = body.sentMessages.length - 1; i >= 0; i--) {
          if (body.sentMessages[i].quoteToken) {
            return body.sentMessages[i].quoteToken;
          }
        }
      }
    } catch (e) {
      writeLog("Lỗi parse quoteToken từ LINE response: " + e.toString(), "WARN");
    }
  }
  return "";
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
      { type: "text", text: "Thực hiện", size: "xs", color: "#888888", flex: 3 },
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
  try {
    var rep = buildInteractionReport(gId, days);
    sendLineReply(token, rep);
  } catch (e) {
    writeLog("Lỗi gửi báo cáo tương tác: " + e.toString(), "ERROR", "guiBaoCaoTuongTac", { gId: gId, days: days });
    sendLineReply(token, "⚠️ Lỗi khi lập báo cáo tương tác nhóm.");
  }
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

    if (ten === "") {
      writeLog("Lỗi xác thực LIFF: Tên sự kiện rỗng", "ERROR", "createTaskFromLIFF", { action: "createTask", userId: nguoiGiao });
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

    // Parse list of groups
    var groups = idG.split(",").map(function(s) { return s.trim(); }).filter(function(s) { return s !== ""; });
    
    // Validate permissions for all groups
    if (nguoiGiao) {
      for (var g = 0; g < groups.length; g++) {
        if (!canCreateTask(nguoiGiao, groups[g])) {
          writeLog("Lỗi phân quyền LIFF: User không có quyền giao việc", "ERROR", "createTaskFromLIFF", { action: "createTask", userId: nguoiGiao, groupId: groups[g] });
          var gName = getGroupName(groups[g]) || groups[g];
          return { success: false, message: "Bạn không có quyền giao việc trong nhóm '" + gName + "'!" };
        }
      }
    }

    // Determine reference employeeName for folder/image naming
    var employeeName = "Unassigned";
    var refGroup = groups[0] || "";
    if (idNV) {
      var firstId = idNV.split(",")[0].trim();
      employeeName = getUserName(firstId, refGroup) || "Staff";
    } else if (nguoiGiao) {
      employeeName = getUserName(nguoiGiao, refGroup) || "Staff";
    }

    // Save images only once
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

    // Loop through each group to create its own task row
    for (var gIndex = 0; gIndex < groups.length; gIndex++) {
      var currentGroup = groups[gIndex];
      globalCurrentUserName = getUserName(nguoiGiao, currentGroup);
      
      var newTaskId = generateTaskId(dateVal);
      if (groups.length > 1) {
        newTaskId = newTaskId + "-" + (gIndex + 1);
      }
      
      var rowData = [
        newTaskId,    // 1. Task ID
        ten,          // 2. Tên sự kiện
        nd,           // 3. Nội dung
        dateVal,      // 4. Ngày giờ gửi
        la,           // 5. Link ảnh đính kèm
        ll,           // 6. Lặp lại
        currentGroup, // 7. Nhóm nhận
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
        "",           // 24. Đã nhắc trước deadline
        ""            // 25. Quote Token
      ];
      ghiDuLieuThongMinh(sheetEvent, rowData);
      
      appendTaskLog(newTaskId, "Tạo việc mới", "", "Chờ xác nhận", "Tạo từ LIFF Form bởi " + globalCurrentUserName);
    }
    
    // Chế độ nhanh từ LIFF: trả kết quả ngay sau khi lưu việc, không bắt người dùng chờ quét/gửi LINE.
    if (data.fastMode === true || String(data.fastMode || "").toLowerCase() === "true") {
      scheduleFastTaskScanFromLIFF_();
    } else {
      checkAndSendLineMessage();
    }
    
    var successMsg = groups.length > 1 
      ? "Đã lưu nhanh công việc cho " + groups.length + " nhóm. Bot sẽ gửi LINE ngay sau đó." 
      : "Đã lưu nhanh công việc. Bot sẽ gửi LINE ngay sau đó.";
      
    return { success: true, message: successMsg };
  } catch (e) {
    return { success: false, message: "Lỗi hệ thống: " + e.toString() };
  }
}


/**
 * Chạy quét gửi LINE sau khi LIFF đã trả kết quả cho người dùng.
 * Mục tiêu: bấm Tạo xong nhanh hơn, không bắt người dùng chờ bot quét/gửi LINE trong cùng request.
 */
function scheduleFastTaskScanFromLIFF_() {
  try {
    var cache = CacheService.getScriptCache();
    var pendingKey = "LIFF_FAST_TASK_SCAN_PENDING";
    if (cache.get(pendingKey)) {
      writeLog("Đã có lịch quét nhanh đang chờ, bỏ qua tạo trigger mới.", "INFO", "scheduleFastTaskScanFromLIFF_");
      return;
    }

    cache.put(pendingKey, "1", 30);
    ScriptApp.newTrigger("RUN_FAST_TASK_SCAN_FROM_LIFF")
      .timeBased()
      .after(1)
      .create();

    writeLog("Đã lên lịch quét gửi LINE nhanh sau khi tạo việc từ LIFF.", "INFO", "scheduleFastTaskScanFromLIFF_");
  } catch (e) {
    writeLog("Không thể lên lịch quét nhanh, trigger mỗi phút vẫn sẽ xử lý: " + e.toString(), "ERROR", "scheduleFastTaskScanFromLIFF_");
  }
}

function RUN_FAST_TASK_SCAN_FROM_LIFF() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "RUN_FAST_TASK_SCAN_FROM_LIFF") {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    CacheService.getScriptCache().remove("LIFF_FAST_TASK_SCAN_PENDING");
    checkAndSendLineMessage();
  } catch (e) {
    writeLog("Lỗi RUN_FAST_TASK_SCAN_FROM_LIFF: " + e.toString(), "ERROR", "RUN_FAST_TASK_SCAN_FROM_LIFF");
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
    if (lastRow > maxLogs + 200) {
      try {
        var numToDelete = lastRow - (maxLogs + 1);
        if (numToDelete > 1000) {
          var keepRange = sheet.getRange(lastRow - maxLogs + 1, 1, maxLogs, 5);
          var keepValues = keepRange.getValues();
          sheet.getRange(2, 1, lastRow - 1, 5).clearContent();
          sheet.getRange(2, 1, maxLogs, 5).setValues(keepValues);
          var currentMax = sheet.getMaxRows();
          if (currentMax > maxLogs + 100) {
            sheet.deleteRows(maxLogs + 2, currentMax - (maxLogs + 1));
          }
        } else {
          sheet.deleteRows(2, numToDelete);
        }
      } catch (delErr) {
        Logger.log("Lỗi dọn dẹp logs: " + delErr.toString());
      }
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
            { type: "text", text: "Dùng nút 'Giao Việc' hoặc gửi /gv để mở form điền thông tin người thực hiện, hạn hoàn thành (Deadline) và hình thức xác nhận.", size: "xs", color: "#555555", wrap: true },
            { type: "text", text: "2. Nhắc việc & Leo thang", weight: "bold", size: "xs", color: "#1DB446", margin: "sm" },
            { type: "text", text: "Bot tự động nhắc nhở người thực hiện theo tần suất cấu hình. Nếu nhắc >= 3 lần mà chưa xong, bot sẽ tag thêm cả người theo dõi để theo dõi sát sao.", size: "xs", color: "#555555", wrap: true },
            { type: "text", text: "3. Nghiệm thu & Tương tác", weight: "bold", size: "xs", color: "#1DB446", margin: "sm" },
            { type: "text", text: "Người thực hiện bấm Hoàn tất hoặc tải ảnh nghiệm thu lên để hoàn tất. Bot tự động lưu giữ lịch sử thực hiện của bạn.", size: "xs", color: "#555555", wrap: true }
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
    "Sự kiện": ["Task ID", "Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline", "Quote Token"],
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
    "Daily_Report": ["Ngày", "Group ID", "Tổng việc", "Đã xong", "Chưa xong", "Quá hạn", "Cần hỗ trợ", "Nội dung báo cáo"],
    "Interaction_Logs": ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"],
    "Group_Settings": ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối", "Bật cảnh báo bất thường", "Ngưỡng giảm tương tác (%)", "Ngưỡng việc quá hạn", "Lần cảnh báo bất thường cuối"],
    "Dashboard_TuongTac": ["Dashboard Thống Kê Tương Tác"]
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
  
  // Lệnh kiểm tra bất thường trong group
  if (["/batthuong", "/canhbao", "/nhanxet"].indexOf(cmd) !== -1) {
    if (!gId) {
      sendLineReply(event.replyToken, "⚠️ Lệnh này chỉ sử dụng được trong Nhóm Chat (Group).");
      return true;
    }
    var rep = buildAnomalyReport(gId);
    sendLineReply(event.replyToken, rep);
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
    "/homnay", "hôm nay", "hom nay", "/tthn", "/toptt"
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

  // 6b. Tương tác 30 ngày
  if ([
    "/tt30ngay", "tương tác 30 ngày", "tuong tac 30 ngay",
    "/30ngay", "30 ngày", "30 ngay", "/tt30"
  ].indexOf(cmd) !== -1) {
    if (gId) {
      guiBaoCaoTuongTac(gId, event.replyToken, 30);
    } else {
      sendLineReply(event.replyToken, "📅 Lệnh này chỉ dùng được trong nhóm LINE để tra cứu tương tác của nhóm.");
    }
    return true;
  }

  // 6c. Im lặng hôm nay
  if (["/imlang", "im lặng", "im lang", "/chuaonline", "chưa online", "chua online"].indexOf(cmd) !== -1) {
    if (gId) {
      var rep = buildSilentMembersReport(gId, 1);
      sendLineReply(event.replyToken, rep);
    } else {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
    }
    return true;
  }
  
  // 6d. Im lặng 7 ngày
  if (["/imlang7ngay", "im lặng 7 ngày", "im lang 7 ngay"].indexOf(cmd) !== -1) {
    if (gId) {
      var rep = buildSilentMembersReport(gId, 7);
      sendLineReply(event.replyToken, rep);
    } else {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
    }
    return true;
  }

  // 6e. Hiệu suất công việc hôm nay
  if (["/hieusuat", "hiệu suất", "hieu suat", "/topviec", "top việc", "top viec"].indexOf(cmd) !== -1) {
    if (gId) {
      var rep = buildTaskPerformanceReport(gId, 1);
      sendLineReply(event.replyToken, rep);
    } else {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
    }
    return true;
  }
  
  // 6f. Hiệu suất công việc 7 ngày
  if (["/hieusuat7ngay", "hiệu suất 7 ngày", "hieu suat 7 ngay", "/chamviec", "chậm việc", "cham viec"].indexOf(cmd) !== -1) {
    if (gId) {
      var rep = buildTaskPerformanceReport(gId, 7);
      sendLineReply(event.replyToken, rep);
    } else {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
    }
    return true;
  }

  // 6g. Khung giờ tương tác hôm nay
  if (["/khunggio", "khung giờ", "khung gio", "/giohot", "giờ hot", "gio hot"].indexOf(cmd) !== -1) {
    if (gId) {
      var rep = buildHourlyInteractionReport(gId, 1);
      sendLineReply(event.replyToken, rep);
    } else {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
    }
    return true;
  }
  
  // 6h. Khung giờ tương tác 7 ngày
  if (["/khunggio7ngay", "khung giờ 7 ngày", "khung gio 7 ngay"].indexOf(cmd) !== -1) {
    if (gId) {
      var rep = buildHourlyInteractionReport(gId, 7);
      sendLineReply(event.replyToken, rep);
    } else {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
    }
    return true;
  }

  // 6i. Bật cảnh báo im lặng
  if (cmd === "/batimlang") {
    if (!gId) {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
      return true;
    }
    var setting = ensureGroupSettings(gId);
    updateGroupSettingField(gId, "Bật cảnh báo im lặng", "Có");
    var silentMinutes = setting ? setting["Số phút im lặng"] : 90;
    sendLineReply(event.replyToken, "✅ Đã BẬT cảnh báo im lặng cho nhóm này. Ngưỡng cảnh báo hiện tại: " + silentMinutes + " phút.");
    return true;
  }

  // 6j. Tắt cảnh báo im lặng
  if (cmd === "/tatimlang") {
    if (!gId) {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
      return true;
    }
    ensureGroupSettings(gId);
    updateGroupSettingField(gId, "Bật cảnh báo im lặng", "Không");
    sendLineReply(event.replyToken, "🚫 Đã TẮT cảnh báo im lặng cho nhóm này.");
    return true;
  }

  // 6k. Cài đặt số phút im lặng
  if (cmd === "/caidatimlang" || cmd.startsWith("/caidatimlang ")) {
    if (!gId) {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
      return true;
    }
    var parts = cmd.split(" ");
    var minutes = parseInt(parts[1], 10);
    if (isNaN(minutes) || minutes <= 0) {
      sendLineReply(event.replyToken, "⚠️ Vui lòng nhập số phút hợp lệ. Cú pháp: /caidatimlang [số phút]");
      return true;
    }
    ensureGroupSettings(gId);
    updateGroupSettingField(gId, "Số phút im lặng", minutes);
    sendLineReply(event.replyToken, "✅ Đã cập nhật thời gian cảnh báo im lặng thành " + minutes + " phút.");
    return true;
  }

  // 6l. Xem trạng thái im lặng
  if (cmd === "/trangthaiimlang") {
    if (!gId) {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
      return true;
    }
    var setting = ensureGroupSettings(gId);
    var enabled = setting["Bật cảnh báo im lặng"] || "Không";
    var silentMinutes = setting["Số phút im lặng"] || 90;
    var start = setting["Giờ bắt đầu theo dõi"] || "08:00";
    var end = setting["Giờ kết thúc theo dõi"] || "21:00";
    var lastAlert = setting["Lần cảnh báo cuối"] || "Chưa có";
    var status = setting["Trạng thái"] || "Bình thường";
    
    var rep = "ℹ️ CẤU HÌNH CẢNH BÁO IM LẶNG\n\n" +
              "• Nhóm: " + (setting["Group Name"] || getGroupName(gId)) + "\n" +
              "• Bật cảnh báo: " + enabled + "\n" +
              "• Số phút im lặng: " + silentMinutes + " phút\n" +
              "• Khung giờ theo dõi: " + start + " - " + end + "\n" +
              "• Trạng thái hiện tại: " + status + "\n" +
              "• Cảnh báo cuối: " + lastAlert;
    sendLineReply(event.replyToken, rep);
    return true;
  }

  // 6m. Bật báo cáo cuối ngày
  if (cmd === "/batbaocao") {
    if (!gId) {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
      return true;
    }
    var setting = ensureGroupSettings(gId);
    updateGroupSettingField(gId, "Bật báo cáo cuối ngày", "Có");
    var targetTime = setting ? setting["Giờ gửi báo cáo"] : "17:30";
    sendLineReply(event.replyToken, "✅ Đã BẬT báo cáo tương tác cuối ngày cho nhóm này. Giờ gửi cấu hình: " + targetTime + ".");
    return true;
  }

  // 6n. Tắt báo cáo cuối ngày
  if (cmd === "/tatbaocao") {
    if (!gId) {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
      return true;
    }
    ensureGroupSettings(gId);
    updateGroupSettingField(gId, "Bật báo cáo cuối ngày", "Không");
    sendLineReply(event.replyToken, "🚫 Đã TẮT báo cáo tương tác cuối ngày cho nhóm này.");
    return true;
  }

  // 6o. Xem báo cáo hôm nay ngay lập tức
  if (cmd === "/baocaongay") {
    if (!gId) {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
      return true;
    }
    try {
      var rep = buildDailyInteractionReport(gId);
      sendLineReply(event.replyToken, rep);
    } catch (e) {
      sendLineReply(event.replyToken, "⚠️ Lỗi khi kết xuất báo cáo: " + e.message);
    }
    return true;
  }

  // 6p. Gửi báo cáo ngay lập tức (chỉ Admin/QL)
  if (cmd === "/guibaocao") {
    if (!gId) {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
      return true;
    }
    var role = getUserRole(uId);
    if (role !== "Admin" && role !== "Quản lý") {
      sendLineReply(event.replyToken, "🚫 Bạn không có quyền sử dụng lệnh này!");
      return true;
    }
    try {
      sendDailyInteractionReport(gId);
      sendLineReply(event.replyToken, "🚀 Đã gửi báo cáo tương tác cuối ngày của nhóm.");
    } catch (e) {
      sendLineReply(event.replyToken, "⚠️ Lỗi khi gửi báo cáo: " + e.message);
    }
    return true;
  }

  // 6q. Chấm điểm sức khoẻ group
  if (cmd === "/health" || cmd.startsWith("/health ") ||
      cmd === "/suckhoe" || cmd.startsWith("/suckhoe ") ||
      cmd === "/diemnhom" || cmd.startsWith("/diemnhom ")) {
    if (!gId) {
      sendLineReply(event.replyToken, "Lệnh này dùng trong nhóm.");
      return true;
    }
    var days = 1;
    var parts = cmd.split(" ");
    if (parts.length > 1) {
      var parsedDays = parseInt(parts[1], 10);
      if (!isNaN(parsedDays) && parsedDays > 0) {
        days = parsedDays;
      }
    }
    try {
      var rep = buildGroupHealthReport(gId, days);
      sendLineReply(event.replyToken, rep);
    } catch (e) {
      sendLineReply(event.replyToken, "⚠️ Lỗi khi chấm điểm sức khoẻ nhóm: " + e.message);
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
    if (func === 'checkAndSendLineMessage' || func === 'guiBaoCaoCuoiNgayTuDong' || func === 'guiBaoCaoTuanTuDong' || func === 'checkSilentGroups' || func === 'checkAndSendDailyInteractionReports') {
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
      
  // 4. Trigger cảnh báo im lặng (mỗi 15 phút)
  setupSilentGroupTrigger();
  
  // 5. Trigger báo cáo tương tác cuối ngày (mỗi 15 phút)
  setupDailyInteractionReportTrigger();
      
  writeLog("Đã đồng bộ thành công các Trình kích hoạt (Nhắc việc: 1 phút, Báo cáo ngày: " + targetHour + "h, Báo cáo tuần: CN 20h, Cảnh báo im lặng: 15p, Báo cáo EOD: 15p)", "INFO");
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
  try {
    cleanOldLogsAndInteractions();
  } catch (cleanErr) {
    writeLog("Lỗi dọn dẹp logs cuối ngày: " + cleanErr.toString(), "WARN");
  }
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

// ==========================================
// THỐNG KÊ TƯƠNG TÁC NHÓM (INTERACTION LOGS)
// ==========================================

function shortenEmployeeName(name) {
  if (!name) return "";
  var idMatch = name.match(/\d{4,6}/);
  if (!idMatch) {
    var cleaned = name;
    cleaned = cleaned.replace(/^(STR_BOSS|STR|ĐMST|DMX|910)[\s_\-]+/gi, "");
    cleaned = cleaned.replace(/[\s_\-]+(AIO|TC|TV|TN)$/gi, "");
    cleaned = cleaned.replace(/[\d\s_\-]+/g, " ").trim();
    return cleaned || name;
  }
  var id = idMatch[0];
  var temp = name.replace(id, "");
  temp = temp.replace(/^(STR_BOSS|STR|ĐMST|DMX|910)[\s_\-]+/gi, "");
  temp = temp.replace(/[\s_\-]+(AIO|TC|TV|TN)$/gi, "");
  temp = temp.replace(/[\d\s_\-]+/g, " ").trim();
  if (temp) {
    temp = temp.split(/\s+/).map(function(word) {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(" ");
  }
  return id + " - " + (temp || "Nhân viên");
}

function ensureInteractionLogsSheet() {
  var ss = getSpreadsheet();
  var sheetName = "Interaction_Logs";
  var expectedHeaders = ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(expectedHeaders);
  }
}

function calculateInteractionScore(type) {
  switch (type) {
    case "text":
      return 1.0;
    case "sticker":
      return 0.5;
    case "image":
      return 2.0;
    case "image_proof":
      return 5.0;
    case "postback_hoantat":
    case "task_completed":
      return 5.0;
    case "postback_can_hotro":
    case "task_help_needed":
      return 2.0;
    case "command":
      return 0.2;
    case "task_overdue":
      return -5.0;
    case "postback_chupanh":
    case "postback_doi_han":
      return 0.2;
    default:
      return 0.0;
  }
}

function isBotCommand(text) {
  if (!text) return false;
  var cmd = text.trim().toLowerCase();
  if (cmd.indexOf("/") === 0) return true;
  
  var cmdList = [
    "help", "trợ giúp", "tro giup", "cú pháp", "cu phap",
    "hd", "huongdan", "hướng dẫn", "huong dan", "giới thiệu", "gioi thieu",
    "gv", "link", "giao", "tao", "do", "tạo việc", "tao viec", "giao việc", "giao viec", "mở giao việc", "mo giao viec",
    "id", "lấy id", "lay id",
    "tthomnay", "tuongtac", "tương tác", "tuong tac", "tương tác hôm nay", "tuong tac hom nay",
    "tt7ngay", "tương tác 7 ngày", "tuong tac 7 ngay",
    "vieccuatoi", "việc của tôi", "viec cua toi",
    "chuaxong", "chưa xong", "chua xong",
    "trehan", "trễ hạn", "tre han",
    "dagiao", "đã giao", "da giao",
    "bot", "trạng thái bot", "trang thai bot",
    "mau", "mẫu", "mẫu công việc", "mau cong viec",
    "log", "xem log",
    "resetmenu", "reset menu",
    "viechomnay", "việc hôm nay", "viec hom nay", "vhn",
    "viec7ngay", "việc 7 ngày", "viec 7 ngay", "v7n",
    "baocaotuan", "báo cáo tuần", "bao cao tuan", "bct"
  ];
  return cmdList.indexOf(cmd) !== -1;
}

function getInteractionTypeFromEvent(event) {
  if (!event) return "text";
  if (event.type === "message") {
    var msgType = event.message.type;
    if (msgType === "text") {
      var text = event.message.text || "";
      if (isBotCommand(text)) {
        return "command";
      }
      return "text";
    }
    if (msgType === "sticker") {
      return "sticker";
    }
    if (msgType === "image") {
      return "image";
    }
  }
  if (event.type === "postback") {
    var data = event.postback.data || "";
    if (data.indexOf("action=confirm_image") !== -1) {
      return "image_proof";
    }
    if (data.indexOf("action=hoantat") !== -1) {
      return "postback_hoantat";
    }
    if (data.indexOf("action=chupanh") !== -1 || data.indexOf("action=chupanh_ghichu") !== -1) {
      return "postback_chupanh";
    }
    if (data.indexOf("action=support") !== -1) {
      return "postback_can_hotro";
    }
    if (data.indexOf("action=delay") !== -1) {
      return "postback_doi_han";
    }
    return "postback";
  }
  return event.type || "other";
}

function summarizeMessageContent(event) {
  if (!event) return "";
  if (event.type === "message") {
    var msgType = event.message.type;
    if (msgType === "text") {
      var txt = event.message.text || "";
      return txt.length > 200 ? txt.substring(0, 200) + "..." : txt;
    }
    if (msgType === "sticker") {
      return "Sticker: packageId=" + (event.message.packageId || "") + ", stickerId=" + (event.message.stickerId || "");
    }
    if (msgType === "image") {
      return "Image: messageId=" + (event.message.id || "");
    }
    return "Message type: " + msgType;
  }
  if (event.type === "postback") {
    var data = event.postback.data || "";
    return "Postback data: " + data;
  }
  return "Event type: " + (event.type || "");
}

function logInteraction(data) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Interaction_Logs");
    if (!sheet) {
      ensureInteractionLogsSheet();
      sheet = ss.getSheetByName("Interaction_Logs");
    }
    if (!sheet) return;
    
    var time = data.time || new Date();
    var tz = Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh";
    var timeStr = Utilities.formatDate(time, tz, "yyyy-MM-dd HH:mm:ss");
    var dateStr = Utilities.formatDate(time, tz, "yyyy-MM-dd");
    var hourStr = Utilities.formatDate(time, tz, "HH:mm:ss");
    
    var groupId = data.groupId || "";
    var groupName = data.groupName || "";
    if (groupId && !groupName) {
      groupName = getGroupName(groupId);
    }
    
    var userId = data.userId || "";
    var userName = data.userName || "";
    if (userId && !userName) {
      userName = resolveMemberName(userId, groupId);
    }
    
    var type = data.type || "text";
    var content = data.content || "";
    var taskId = data.taskId || "";
    var score = typeof data.score === "number" ? data.score : calculateInteractionScore(type);
    var source = data.source || "Webhook";
    var note = data.note || "";
    
    sheet.appendRow([
      timeStr,
      dateStr,
      hourStr,
      groupId,
      groupName,
      userId,
      userName,
      type,
      content,
      taskId,
      score,
      source,
      note
    ]);
    
    if (groupId) {
      try {
        ensureGroupSettings(groupId, groupName);
        resetGroupSilentStatus(groupId);
      } catch (e) {
        writeLog("Lỗi tự động cập nhật Group_Settings: " + e.message, "WARNING");
      }
    }
  } catch (err) {
    writeLog("Lỗi ghi log tương tác: " + err.toString(), "ERROR", "logInteraction", data);
  }
}

function formatDateDMY(date) {
  var d = date.getDate();
  var m = date.getMonth() + 1;
  var y = date.getFullYear();
  return (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + y;
}

function getGroupMembersCount(groupId) {
  if (!groupId) return 0;
  try {
    var res = callLineApi("group/" + groupId + "/members/count", { method: "get", muteHttpExceptions: true }, "Lấy số thành viên nhóm");
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText()).count || 0;
    }
  } catch (e) {
    writeLog("Lỗi lấy số lượng thành viên nhóm: " + e.toString(), "WARNING", "getGroupMembersCount");
  }
  return 0;
}

function getInteractionStats(groupId, days) {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("Interaction_Logs");
  var useLogs = false;
  var data = [];
  
  if (logSheet && logSheet.getLastRow() > 1) {
    data = logSheet.getDataRange().getValues();
    var colGroup = getColumnIndexByHeader(logSheet, "Group ID");
    if (colGroup !== -1) {
      for (var i = 1; i < data.length; i++) {
        if (data[i][colGroup - 1] === groupId) {
          useLogs = true;
          break;
        }
      }
    }
  }
  
  var stats = {
    total: 0,
    text: 0,
    sticker: 0,
    image: 0,
    command: 0,
    hoantat: 0,
    proof: 0,
    members: {},
    totalScore: 0,
    activeCount: 0
  };
  
  var start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  var startTime = start.getTime();
  
  if (useLogs) {
    var colTime = getColumnIndexByHeader(logSheet, "Thời gian");
    var colGroup = getColumnIndexByHeader(logSheet, "Group ID");
    var colUser = getColumnIndexByHeader(logSheet, "User ID");
    var colName = getColumnIndexByHeader(logSheet, "Tên Line");
    var colType = getColumnIndexByHeader(logSheet, "Loại tương tác");
    var colScore = getColumnIndexByHeader(logSheet, "Điểm tương tác");
    
    if (colTime !== -1 && colGroup !== -1 && colUser !== -1 && colName !== -1 && colType !== -1 && colScore !== -1) {
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var rowGroup = row[colGroup - 1];
        if (rowGroup !== groupId) continue;
        
        var rowTimeVal = row[colTime - 1];
        var rowTime = new Date(rowTimeVal).getTime();
        if (isNaN(rowTime) || rowTime < startTime) continue;
        
        var userId = row[colUser - 1];
        if (!userId) continue;
        
        var userName = row[colName - 1] || "Người dùng";
        var type = row[colType - 1];
        var score = parseFloat(row[colScore - 1]) || 0;
        
        if (!stats.members[userId]) {
          stats.members[userId] = {
            name: userName,
            score: 0,
            total: 0,
            text: 0,
            sticker: 0,
            image: 0,
            command: 0,
            hoantat: 0,
            proof: 0
          };
        }
        
        var m = stats.members[userId];
        m.score += score;
        m.total += 1;
        stats.total += 1;
        stats.totalScore += score;
        
        if (type === "text") {
          m.text += 1;
          stats.text += 1;
        } else if (type === "sticker") {
          m.sticker += 1;
          stats.sticker += 1;
        } else if (type === "image") {
          m.image += 1;
          stats.image += 1;
        } else if (type === "command") {
          m.command += 1;
          stats.command += 1;
        } else if (type === "postback_hoantat" || type === "task_completed") {
          m.hoantat += 1;
          stats.hoantat += 1;
        } else if (type === "image_proof") {
          m.proof += 1;
          stats.proof += 1;
        }
      }
    }
  } else {
    var legacySheet = ss.getSheetByName("Tương Tác") || ss.getSheetByName("Tương tác") || ss.getSheetByName("TuongTac");
    if (legacySheet && legacySheet.getLastRow() > 1) {
      var legacyData = legacySheet.getDataRange().getValues();
      var colTime = 1;
      var colGroup = 2;
      var colUser = 3;
      var colName = 4;
      var colText = 5;
      var colSticker = 6;
      var colImg = 7;
      var colTotal = 8;
      
      for (var i = 1; i < legacyData.length; i++) {
        var row = legacyData[i];
        var rowGroup = row[colGroup - 1];
        if (rowGroup !== groupId) continue;
        
        var rowTimeVal = row[colTime - 1];
        var rowTime = new Date(rowTimeVal).getTime();
        if (isNaN(rowTime) || rowTime < startTime) continue;
        
        var userId = row[colUser - 1];
        if (!userId) continue;
        
        var userName = row[colName - 1] || "Người dùng";
        var txtCount = parseInt(row[colText - 1]) || 0;
        var stCount = parseInt(row[colSticker - 1]) || 0;
        var imgCount = parseInt(row[colImg - 1]) || 0;
        var totCount = parseInt(row[colTotal - 1]) || 0;
        
        if (!stats.members[userId]) {
          stats.members[userId] = {
            name: userName,
            score: 0,
            total: 0,
            text: 0,
            sticker: 0,
            image: 0,
            command: 0,
            hoantat: 0,
            proof: 0
          };
        }
        
        var m = stats.members[userId];
        var score = txtCount * 1.0 + stCount * 0.5 + imgCount * 2.0;
        m.score += score;
        m.total += totCount;
        m.text += txtCount;
        m.sticker += stCount;
        m.image += imgCount;
        
        stats.total += totCount;
        stats.text += txtCount;
        stats.sticker += stCount;
        stats.image += imgCount;
        stats.totalScore += score;
      }
    }
  }
  
  stats.activeCount = Object.keys(stats.members).length;
  return stats;
}

function buildInteractionInsight(stats) {
  var Y = getGroupMembersCount(stats.groupId || "");
  var X = stats.activeCount;
  if (Y <= 0 || Y < X) Y = X;
  
  var activeRatio = Y > 0 ? (X / Y) : 0;
  if (activeRatio >= 0.8) {
    return "Nhóm hoạt động tốt.";
  } else if (activeRatio >= 0.5) {
    return "Nhóm hoạt động trung bình.";
  } else {
    return "Cần nhắc nhóm tương tác/cập nhật tiến độ.";
  }
}

function buildInteractionReport(groupId, days) {
  var stats = getInteractionStats(groupId, days);
  stats.groupId = groupId;
  
  var groupName = getGroupName(groupId);
  var reportTitle = "📊 TƯƠNG TÁC " + (days === 1 ? "HÔM NAY" : (days === 7 ? "7 NGÀY QUA" : days + " NGÀY QUA"));
  
  var dateStr = "";
  var today = new Date();
  if (days === 1) {
    dateStr = formatDateDMY(today);
  } else {
    var start = new Date();
    start.setDate(today.getDate() - days + 1);
    dateStr = formatDateDMY(start) + " - " + formatDateDMY(today);
  }
  
  var Y = getGroupMembersCount(groupId);
  var X = stats.activeCount;
  if (Y <= 0 || Y < X) Y = X;
  
  var insight = buildInteractionInsight(stats);
  
  var details = [];
  if (stats.text > 0) details.push(stats.text + " Tin nhắn");
  if (stats.sticker > 0) details.push(stats.sticker + " Sticker");
  if (stats.image > 0) details.push(stats.image + " Ảnh thường");
  if (stats.command > 0) details.push(stats.command + " Lệnh bot");
  if (stats.hoantat > 0) details.push(stats.hoantat + " Hoàn tất việc");
  if (stats.proof > 0) details.push(stats.proof + " Ảnh nghiệm thu");
  
  var detailsStr = details.length > 0 ? " (" + details.join(", ") + ")" : "";
  
  var rep = reportTitle + "\n" +
            "Group: " + groupName + "\n" +
            "Ngày: " + dateStr + "\n" +
            "Hoạt động: " + X + "/" + Y + " TV\n" +
            "Tổng tương tác: " + stats.total + " lượt" + detailsStr + "\n\n";
  
  var allMembers = Object.keys(stats.members).map(function(userId) {
    return {
      userId: userId,
      name: stats.members[userId].name,
      total: stats.members[userId].total
    };
  });
  
  if (allMembers.length === 0) {
    rep += "🔥 Thành viên tích cực:\n(Không có dữ liệu)\n\n📌 Nhận xét: " + insight;
    return rep;
  }
  
  // Sắp xếp theo số lượt tương tác giảm dần
  var sortedMembers = allMembers.sort(function(a, b) {
    return b.total - a.total;
  });
  
  var limit = 5;
  var showTop = sortedMembers.slice(0, limit);
  
  rep += "🔥 Thành viên tích cực:\n";
  showTop.forEach(function(m, idx) {
    var shortName = shortenEmployeeName(m.name);
    rep += (idx + 1) + ". " + shortName + ": " + m.total + "\n";
  });
  
  rep += "\n📌 Nhận xét: " + insight;
  
  return rep;
}

function getActiveMemberCount(groupId, days) {
  var stats = getInteractionStats(groupId, days);
  return stats.activeCount;
}

function getTopInteractionMembers(groupId, days, limit) {
  var stats = getInteractionStats(groupId, days);
  var arr = Object.keys(stats.members).map(function(userId) {
    return {
      userId: userId,
      name: stats.members[userId].name,
      score: stats.members[userId].score,
      total: stats.members[userId].total
    };
  });
  arr.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return b.total - a.total;
  });
  return typeof limit === "number" ? arr.slice(0, limit) : arr;
}

function getBottomInteractionMembers(groupId, days, limit) {
  var stats = getInteractionStats(groupId, days);
  var arr = Object.keys(stats.members).map(function(userId) {
    return {
      userId: userId,
      name: stats.members[userId].name,
      score: stats.members[userId].score,
      total: stats.members[userId].total
    };
  });
  arr.sort(function(a, b) {
    if (a.score !== b.score) return a.score - b.score;
    return a.total - b.total;
  });
  return typeof limit === "number" ? arr.slice(0, limit) : arr;
}

function getKnownGroupMembers(groupId) {
  var ss = getSpreadsheet();
  var members = {};
  
  function addMember(userId, name) {
    if (!userId) return;
    if (!members[userId]) {
      members[userId] = name || "";
    } else if (!members[userId] && name) {
      members[userId] = name;
    }
  }
  
  var logSheet = ss.getSheetByName("Interaction_Logs");
  if (logSheet && logSheet.getLastRow() > 1) {
    var data = logSheet.getDataRange().getValues();
    var colGroup = getColumnIndexByHeader(logSheet, "Group ID");
    var colUser = getColumnIndexByHeader(logSheet, "User ID");
    var colName = getColumnIndexByHeader(logSheet, "Tên Line");
    if (colGroup !== -1 && colUser !== -1 && colName !== -1) {
      for (var i = 1; i < data.length; i++) {
        if (data[i][colGroup - 1] === groupId) {
          addMember(data[i][colUser - 1], data[i][colName - 1]);
        }
      }
    }
  }
  
  var legacySheet = ss.getSheetByName("Tương Tác") || ss.getSheetByName("Tương tác") || ss.getSheetByName("TuongTac");
  if (legacySheet && legacySheet.getLastRow() > 1) {
    var legacyData = legacySheet.getDataRange().getValues();
    for (var i = 1; i < legacyData.length; i++) {
      if (legacyData[i][1] === groupId) {
        addMember(legacyData[i][2], legacyData[i][3]);
      }
    }
  }
  
  var sEv = ss.getSheetByName("Sự kiện");
  if (sEv && sEv.getLastRow() > 1) {
    var evData = sEv.getDataRange().getValues();
    var colNhom = getColumnIndexByHeader(sEv, "Nhóm nhận");
    var colXN = getColumnIndexByHeader(sEv, "Người phụ trách");
    if (colNhom !== -1 && colXN !== -1) {
      for (var i = 1; i < evData.length; i++) {
        if (evData[i][colNhom - 1] === groupId) {
          var assignees = evData[i][colXN - 1];
          if (assignees) {
            var ids = String(assignees).split(",");
            for (var j = 0; j < ids.length; j++) {
              var id = ids[j].trim();
              if (id) {
                addMember(id, "");
              }
            }
          }
        }
      }
    }
  }
  
  var sMem = ss.getSheetByName("ID_Member");
  if (sMem && sMem.getLastRow() > 1) {
    var memValues = sMem.getDataRange().getValues();
    for (var i = 1; i < memValues.length; i++) {
      var userId = memValues[i][1];
      var name = memValues[i][0];
      if (members[userId] === "") {
        members[userId] = name;
      }
    }
  }
  
  var sRoles = ss.getSheetByName("User_Roles");
  if (sRoles && sRoles.getLastRow() > 1) {
    var roleValues = sRoles.getDataRange().getValues();
    for (var i = 1; i < roleValues.length; i++) {
      var userId = roleValues[i][1];
      var name = roleValues[i][0];
      if (members[userId] === "") {
        members[userId] = name;
      }
    }
  }
  
  for (var k in members) {
    if (!members[k]) {
      members[k] = k;
    }
  }
  
  return members;
}

function getActiveUsersInGroup(groupId, days) {
  var ss = getSpreadsheet();
  var activeIds = {};
  
  var start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  var startTime = start.getTime();
  
  var logSheet = ss.getSheetByName("Interaction_Logs");
  var useLogs = false;
  if (logSheet && logSheet.getLastRow() > 1) {
    var data = logSheet.getDataRange().getValues();
    var colGroup = getColumnIndexByHeader(logSheet, "Group ID");
    if (colGroup !== -1) {
      for (var i = 1; i < data.length; i++) {
        if (data[i][colGroup - 1] === groupId) {
          useLogs = true;
          break;
        }
      }
    }
  }
  
  if (useLogs) {
    var data = logSheet.getDataRange().getValues();
    var colTime = getColumnIndexByHeader(logSheet, "Thời gian");
    var colGroup = getColumnIndexByHeader(logSheet, "Group ID");
    var colUser = getColumnIndexByHeader(logSheet, "User ID");
    var colType = getColumnIndexByHeader(logSheet, "Loại tương tác");
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[colGroup - 1] !== groupId) continue;
      
      var rowTime = new Date(row[colTime - 1]).getTime();
      if (isNaN(rowTime) || rowTime < startTime) continue;
      
      var userId = row[colUser - 1];
      var type = row[colType - 1];
      if (!userId || type === "task_overdue") continue;
      
      activeIds[userId] = true;
    }
  } else {
    var legacySheet = ss.getSheetByName("Tương Tác") || ss.getSheetByName("Tương tác") || ss.getSheetByName("TuongTac");
    if (legacySheet && legacySheet.getLastRow() > 1) {
      var legacyData = legacySheet.getDataRange().getValues();
      for (var i = 1; i < legacyData.length; i++) {
        var row = legacyData[i];
        if (row[1] !== groupId) continue;
        
        var rowTime = new Date(row[0]).getTime();
        if (isNaN(rowTime) || rowTime < startTime) continue;
        
        var userId = row[2];
        var text = parseInt(row[4]) || 0;
        var sticker = parseInt(row[5]) || 0;
        var image = parseInt(row[6]) || 0;
        var total = parseInt(row[7]) || 0;
        
        if (userId && (text > 0 || sticker > 0 || image > 0 || total > 0)) {
          activeIds[userId] = true;
        }
      }
    }
  }
  
  return Object.keys(activeIds);
}

function getSilentMembers(groupId, days) {
  var knownMembers = getKnownGroupMembers(groupId);
  var activeUsers = getActiveUsersInGroup(groupId, days);
  
  var silentMembers = [];
  for (var userId in knownMembers) {
    if (activeUsers.indexOf(userId) === -1) {
      silentMembers.push({
        userId: userId,
        name: knownMembers[userId]
      });
    }
  }
  
  return silentMembers;
}

function buildSilentMembersReport(groupId, days) {
  var silent = getSilentMembers(groupId, days);
  var known = getKnownGroupMembers(groupId);
  var totalKnown = Object.keys(known).length;
  var silentCount = silent.length;
  
  var groupName = getGroupName(groupId);
  var reportTitle = "⚠️ THÀNH VIÊN CHƯA TƯƠNG TÁC " + (days === 1 ? "HÔM NAY" : days + " NGÀY QUA");
  
  var dateStr = "";
  var today = new Date();
  if (days === 1) {
    dateStr = formatDateDMY(today);
  } else {
    var start = new Date();
    start.setDate(today.getDate() - days + 1);
    dateStr = formatDateDMY(start) + " - " + formatDateDMY(today);
  }
  
  var rep = reportTitle + "\n\n" +
            "Group: " + groupName + "\n" +
            "Ngày: " + dateStr + "\n\n" +
            "Chưa tương tác: " + silentCount + "/" + totalKnown + "\n\n";
            
  if (silentCount === 0) {
    rep += "🎉 Tuyệt vời! Tất cả thành viên đều đã tương tác.";
  } else {
    silent.forEach(function(m, idx) {
      var shortName = shortenEmployeeName(m.name);
      rep += (idx + 1) + ". " + shortName + "\n";
    });
  }
  
  rep += "\n📌 Ghi chú: Bot chỉ thống kê các thành viên đã từng tương tác hoặc đã được ghi nhận.";
  
  return rep;
}

function calculateCompletionRate(done, total) {
  if (total <= 0) return 0;
  return parseFloat(((done / total) * 100).toFixed(1));
}

function calculateAverageResponseTime(taskLogs) {
  if (!taskLogs || taskLogs.length <= 1) return 0;
  
  var headers = taskLogs[0].map(function(h) { return String(h).trim(); });
  var idxTime = headers.indexOf("Thời gian");
  var idxTaskId = headers.indexOf("Task ID");
  var idxAction = headers.indexOf("Hành động");
  
  if (idxTime === -1 || idxTaskId === -1 || idxAction === -1) return 0;
  
  var taskTimes = {};
  
  for (var i = 1; i < taskLogs.length; i++) {
    var row = taskLogs[i];
    var taskId = row[idxTaskId];
    if (!taskId) continue;
    
    var timeVal = row[idxTime];
    var time = new Date(timeVal);
    if (isNaN(time.getTime())) continue;
    
    var action = String(row[idxAction]).trim();
    
    if (!taskTimes[taskId]) {
      taskTimes[taskId] = { start: null, response: null };
    }
    
    if (action === "Tạo việc") {
      taskTimes[taskId].start = time;
    } else if (action === "Đổi trạng thái" || action === "Nghiệm thu ảnh" || action === "Ghi nhận tiến độ") {
      if (!taskTimes[taskId].response || time < taskTimes[taskId].response) {
        taskTimes[taskId].response = time;
      }
    }
  }
  
  for (var i = 1; i < taskLogs.length; i++) {
    var row = taskLogs[i];
    var taskId = row[idxTaskId];
    if (!taskId) continue;
    
    var timeVal = row[idxTime];
    var time = new Date(timeVal);
    if (isNaN(time.getTime())) continue;
    
    var m = taskTimes[taskId];
    if (!m.start) {
      m.start = time;
    } else if (time < m.start) {
      m.response = m.start;
      m.start = time;
    }
  }
  
  var totalDiff = 0;
  var count = 0;
  for (var taskId in taskTimes) {
    var m = taskTimes[taskId];
    if (m.start && m.response && m.response > m.start) {
      var diffHours = (m.response.getTime() - m.start.getTime()) / (1000 * 60 * 60);
      totalDiff += diffHours;
      count++;
    }
  }
  
  return count > 0 ? (totalDiff / count) : 0;
}

function getTaskPerformanceStats(groupId, days) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Sự kiện");
  
  var stats = {
    total: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
    support: 0,
    completionRate: 0,
    avgResponseTime: 0,
    proofCount: 0,
    reminderCount: 0
  };
  
  if (!sheet || sheet.getLastRow() < 2) return stats;
  
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(h) { return String(h).trim(); });
  
  var colGroup = headers.indexOf("Nhóm nhận") + 1;
  var colTime = headers.indexOf("Ngày giờ gửi") + 1;
  var colStatus = headers.indexOf("Trạng thái") + 1;
  var colDeadline = headers.indexOf("Deadline") + 1;
  var colReminders = headers.indexOf("Số lần nhắc") + 1;
  var colProof = headers.indexOf("Link Ảnh Nghiệm Thu") + 1;
  var colTaskId = headers.indexOf("Task ID") + 1;
  
  if (colGroup === 0 || colTime === 0 || colStatus === 0) return stats;
  
  var start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  var startTime = start.getTime();
  var now = new Date().getTime();
  
  var taskIds = [];
  
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var gId = String(row[colGroup - 1]).trim();
    if (groupId && gId !== groupId) continue;
    
    var timeVal = row[colTime - 1];
    var time = new Date(timeVal).getTime();
    if (isNaN(time) || time < startTime) continue;
    
    stats.total++;
    
    var status = String(row[colStatus - 1]).trim();
    var deadlineVal = colDeadline > 0 ? row[colDeadline - 1] : "";
    var deadlineTime = deadlineVal ? new Date(deadlineVal).getTime() : 0;
    
    if (status === "Đã gửi") {
      stats.completed++;
    } else if (status === "Đã hủy") {
      // ignore
    } else {
      stats.pending++;
      if (status === "Quá hạn" || (deadlineTime > 0 && deadlineTime < now)) {
        stats.overdue++;
      }
      if (status === "Cần hỗ trợ") {
        stats.support++;
      }
    }
    
    if (colReminders > 0) {
      stats.reminderCount += parseInt(row[colReminders - 1]) || 0;
    }
    
    if (colProof > 0) {
      var proofStr = String(row[colProof - 1] || "").trim();
      if (proofStr) {
        var links = proofStr.split(",");
        links.forEach(function(link) {
          if (link.trim().startsWith("http")) {
            stats.proofCount++;
          }
        });
      }
    }
    
    if (colTaskId > 0 && row[colTaskId - 1]) {
      taskIds.push(row[colTaskId - 1]);
    }
  }
  
  stats.completionRate = calculateCompletionRate(stats.completed, stats.total);
  
  var logSheet = ss.getSheetByName("Task_Logs");
  if (logSheet && logSheet.getLastRow() > 1 && taskIds.length > 0) {
    var logValues = logSheet.getDataRange().getValues();
    var logHeaders = logValues[0].map(function(h) { return String(h).trim(); });
    var idxTaskId = logHeaders.indexOf("Task ID");
    
    if (idxTaskId !== -1) {
      var filteredLogs = [logValues[0]];
      for (var i = 1; i < logValues.length; i++) {
        var row = logValues[i];
        if (taskIds.indexOf(row[idxTaskId]) !== -1) {
          filteredLogs.push(row);
        }
      }
      stats.avgResponseTime = calculateAverageResponseTime(filteredLogs);
    }
  }
  
  return stats;
}

function getUserTaskPerformance(groupId, days) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Sự kiện");
  var userStats = {};
  
  if (!sheet || sheet.getLastRow() < 2) return userStats;
  
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(h) { return String(h).trim(); });
  
  var colGroup = headers.indexOf("Nhóm nhận") + 1;
  var colTime = headers.indexOf("Ngày giờ gửi") + 1;
  var colStatus = headers.indexOf("Trạng thái") + 1;
  var colDeadline = headers.indexOf("Deadline") + 1;
  var colReminders = headers.indexOf("Số lần nhắc") + 1;
  var colProof = headers.indexOf("Link Ảnh Nghiệm Thu") + 1;
  var colUser = headers.indexOf("Người phụ trách") + 1;
  var colTaskId = headers.indexOf("Task ID") + 1;
  
  if (colGroup === 0 || colTime === 0 || colStatus === 0 || colUser === 0) return userStats;
  
  var start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  var startTime = start.getTime();
  var now = new Date().getTime();
  
  var userTasks = {};
  
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var gId = String(row[colGroup - 1]).trim();
    if (groupId && gId !== groupId) continue;
    
    var timeVal = row[colTime - 1];
    var time = new Date(timeVal).getTime();
    if (isNaN(time) || time < startTime) continue;
    
    var assigneesStr = String(row[colUser - 1]).trim();
    if (!assigneesStr) continue;
    
    var uIds = assigneesStr.split(",");
    var status = String(row[colStatus - 1]).trim();
    var deadlineVal = colDeadline > 0 ? row[colDeadline - 1] : "";
    var deadlineTime = deadlineVal ? new Date(deadlineVal).getTime() : 0;
    var taskId = colTaskId > 0 ? row[colTaskId - 1] : "";
    
    uIds.forEach(function(uId) {
      uId = uId.trim();
      if (!uId) return;
      
      if (!userStats[uId]) {
        userStats[uId] = {
          userId: uId,
          name: resolveMemberName(uId, groupId),
          total: 0,
          completed: 0,
          pending: 0,
          overdue: 0,
          support: 0,
          completionRate: 0,
          avgResponseTime: 0,
          proofCount: 0,
          reminderCount: 0
        };
        userTasks[uId] = [];
      }
      
      var uStats = userStats[uId];
      uStats.total++;
      
      if (status === "Đã gửi") {
        uStats.completed++;
      } else if (status === "Đã hủy") {
        // ignore
      } else {
        uStats.pending++;
        if (status === "Quá hạn" || (deadlineTime > 0 && deadlineTime < now)) {
          uStats.overdue++;
        }
        if (status === "Cần hỗ trợ") {
          uStats.support++;
        }
      }
      
      if (colReminders > 0) {
        uStats.reminderCount += parseInt(row[colReminders - 1]) || 0;
      }
      
      if (colProof > 0) {
        var proofStr = String(row[colProof - 1] || "").trim();
        if (proofStr) {
          var links = proofStr.split(",");
          links.forEach(function(link) {
            if (link.trim().startsWith("http")) {
              uStats.proofCount++;
            }
          });
        }
      }
      
      if (taskId) {
        userTasks[uId].push(taskId);
      }
    });
  }
  
  for (var uId in userStats) {
    userStats[uId].completionRate = calculateCompletionRate(userStats[uId].completed, userStats[uId].total);
  }
  
  var logSheet = ss.getSheetByName("Task_Logs");
  if (logSheet && logSheet.getLastRow() > 1) {
    var logValues = logSheet.getDataRange().getValues();
    var logHeaders = logValues[0].map(function(h) { return String(h).trim(); });
    var idxTaskId = logHeaders.indexOf("Task ID");
    
    if (idxTaskId !== -1) {
      for (var uId in userStats) {
        var tIds = userTasks[uId];
        if (tIds.length === 0) continue;
        
        var filteredLogs = [logValues[0]];
        for (var i = 1; i < logValues.length; i++) {
          var row = logValues[i];
          if (tIds.indexOf(row[idxTaskId]) !== -1) {
            filteredLogs.push(row);
          }
        }
        userStats[uId].avgResponseTime = calculateAverageResponseTime(filteredLogs);
      }
    }
  }
  
  return userStats;
}

function buildTaskPerformanceReport(groupId, days) {
  var stats = getTaskPerformanceStats(groupId, days);
  var userPerf = getUserTaskPerformance(groupId, days);
  
  var groupName = getGroupName(groupId);
  var reportTitle = "📌 HIỆU SUẤT CÔNG VIỆC " + (days === 1 ? "HÔM NAY" : days + " NGÀY QUA");
  
  var dateStr = "";
  var today = new Date();
  if (days === 1) {
    dateStr = formatDateDMY(today);
  } else {
    var start = new Date();
    start.setDate(today.getDate() - days + 1);
    dateStr = formatDateDMY(start) + " - " + formatDateDMY(today);
  }
  
  var rep = reportTitle + "\n\n" +
            "Group: " + groupName + "\n" +
            "Ngày: " + dateStr + "\n\n" +
            "Tổng việc: " + stats.total + "\n" +
            "Đã hoàn tất: " + stats.completed + "\n" +
            "Chưa xong: " + stats.pending + "\n" +
            "Quá hạn: " + stats.overdue + "\n" +
            "Tỷ lệ hoàn thành: " + stats.completionRate + "%\n\n";
            
  var userList = Object.keys(userPerf).map(function(k) { return userPerf[k]; });
  
  rep += "🏆 Top hoàn tất tốt:\n";
  if (userList.length === 0) {
    rep += "(Chưa có dữ liệu thành viên)\n";
  } else {
    var topList = [].concat(userList).sort(function(a, b) {
      if (b.completed !== a.completed) return b.completed - a.completed;
      return b.completionRate - a.completionRate;
    });
    
    var showTop = topList.slice(0, 3);
    if (showTop.length === 0 || showTop[0].completed === 0) {
      rep += "(Chưa có việc hoàn thành)\n";
    } else {
      showTop.forEach(function(u, idx) {
        var shortName = shortenEmployeeName(u.name);
        rep += (idx + 1) + ". " + shortName + " - " + u.completed + "/" + u.total + " việc - " + Math.round(u.completionRate) + "%\n";
      });
    }
  }
  
  rep += "\n⚠️ Cần theo dõi:\n";
  var followUpList = [];
  
  userList.forEach(function(u) {
    if (u.overdue > 0) {
      followUpList.push({
        name: u.name,
        text: u.overdue + " việc quá hạn",
        sortVal: u.overdue * 1000
      });
    }
    if (u.avgResponseTime > 0.01) {
      var hoursStr = u.avgResponseTime.toFixed(1).replace(".0", "");
      followUpList.push({
        name: u.name,
        text: "phản hồi chậm trung bình " + hoursStr + " giờ",
        sortVal: u.avgResponseTime
      });
    }
  });
  
  if (followUpList.length === 0) {
    rep += "Không có nhân viên cần theo dõi.";
  } else {
    followUpList.sort(function(a, b) { return b.sortVal - a.sortVal; });
    var showFollow = followUpList.slice(0, 5);
    showFollow.forEach(function(item, idx) {
      var shortName = shortenEmployeeName(item.name);
      rep += (idx + 1) + ". " + shortName + " - " + item.text + "\n";
    });
  }
  
  return rep;
}

function getHourlyInteractionStats(groupId, days) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Interaction_Logs");
  var hourStats = new Array(24).fill(0);
  
  if (!sheet || sheet.getLastRow() < 2) return hourStats;
  
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(h) { return String(h).trim(); });
  
  var colGroup = headers.indexOf("Group ID") + 1;
  var colTime = headers.indexOf("Thời gian") + 1;
  var colHour = headers.indexOf("Giờ") + 1;
  
  if (colGroup === 0 || colTime === 0) return hourStats;
  
  var start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  var startTime = start.getTime();
  
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var gId = String(row[colGroup - 1]).trim();
    if (groupId && gId !== groupId) continue;
    
    var timeVal = row[colTime - 1];
    var time = new Date(timeVal).getTime();
    if (isNaN(time) || time < startTime) continue;
    
    var hour = -1;
    if (colHour > 0 && row[colHour - 1]) {
      var hourPart = String(row[colHour - 1]).split(":")[0];
      hour = parseInt(hourPart);
    }
    if (isNaN(hour) || hour < 0 || hour > 23) {
      var match = String(timeVal).match(/\s(\d{2}):/);
      if (match) {
        hour = parseInt(match[1]);
      } else {
        hour = new Date(timeVal).getHours();
      }
    }
    
    if (hour >= 0 && hour <= 23) {
      hourStats[hour]++;
    }
  }
  
  return hourStats;
}

function getPeakHour(hourStats) {
  var maxVal = -1;
  var peakHour = -1;
  for (var i = 0; i < 24; i++) {
    if (hourStats[i] > maxVal) {
      maxVal = hourStats[i];
      peakHour = i;
    }
  }
  return maxVal > 0 ? peakHour : -1;
}

function getLowHour(hourStats) {
  var minVal = Infinity;
  var lowHour = -1;
  for (var i = 0; i < 24; i++) {
    if (hourStats[i] < minVal) {
      minVal = hourStats[i];
      lowHour = i;
    }
  }
  return lowHour;
}

function buildHourlyInteractionReport(groupId, days) {
  var hourStats = getHourlyInteractionStats(groupId, days);
  
  var total = 0;
  for (var i = 0; i < 24; i++) {
    total += hourStats[i];
  }
  
  if (total === 0) {
    return "⚠️ Chưa có dữ liệu tương tác trong group này.";
  }
  
  var groupName = getGroupName(groupId);
  var reportTitle = "🕒 KHUNG GIỜ TƯƠNG TÁC MẠNH";
  var rangeStr = days === 1 ? "hôm nay" : days + " ngày";
  
  var rep = reportTitle + "\n\n" +
            "Group: " + groupName + "\n" +
            "Phạm vi: " + rangeStr + "\n\n";
            
  for (var h = 0; h < 24; h++) {
    if (hourStats[h] > 0) {
      var startStr = (h < 10 ? "0" : "") + h + ":00";
      var endStr = ((h + 1) < 10 ? "0" : "") + (h + 1) + ":00";
      rep += startStr + " - " + endStr + ": " + hourStats[h] + " tương tác\n";
    }
  }
  
  var peak = getPeakHour(hourStats);
  var low = getLowHour(hourStats);
  
  if (peak !== -1) {
    var pStartStr = (peak < 10 ? "0" : "") + peak + ":00";
    var pEndStr = ((peak + 1) < 10 ? "0" : "") + (peak + 1) + ":00";
    rep += "\n🔥 Sôi động nhất: " + pStartStr + " - " + pEndStr + "\n";
  }
  
  if (low !== -1) {
    var lStartStr = (low < 10 ? "0" : "") + low + ":00";
    var lEndStr = ((low + 1) < 10 ? "0" : "") + (low + 1) + ":00";
    rep += "⚠️ Yếu nhất: " + lStartStr + " - " + lEndStr + "\n";
  }
  
  rep += "\n📌 Gợi ý:\n";
  if (peak !== -1) {
    var pStartStr = (peak < 10 ? "0" : "") + peak + ":00";
    var pEndStr = ((peak + 1) < 10 ? "0" : "") + (peak + 1) + ":00";
    rep += "Nên gửi nhắc việc quan trọng trong khung " + pStartStr + " - " + pEndStr + ".";
  } else {
    rep += "Nên gửi nhắc việc trong các giờ làm việc bình thường.";
  }
  
  return rep;
}

function getGroupSettings(groupId) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Group_Settings");
  if (!sheet) {
    ensureSheetAndHeaders();
    sheet = ss.getSheetByName("Group_Settings");
  }
  if (!sheet) return null;
  
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  
  var headers = values[0].map(function(h) { return String(h).trim(); });
  var colGroupId = headers.indexOf("Group ID") + 1;
  if (colGroupId === 0) return null;
  
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][colGroupId - 1]).trim() === groupId) {
      var s = {};
      headers.forEach(function(h, idx) {
        s[h] = values[i][idx];
      });
      s.rowIndex = i + 1;
      return s;
    }
  }
  return null;
}

function ensureGroupSettings(groupId, groupName) {
  var setting = getGroupSettings(groupId);
  if (setting) return setting;
  
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Group_Settings");
  if (!sheet) {
    ensureSheetAndHeaders();
    sheet = ss.getSheetByName("Group_Settings");
  }
  if (!sheet) return null;
  
  if (!groupName) {
    groupName = getGroupName(groupId);
  }
  
  var newRow = [
    groupId,
    groupName || "",
    "Không",          // Bật cảnh báo im lặng
    90,               // Số phút im lặng
    "08:00",          // Giờ bắt đầu theo dõi
    "21:00",          // Giờ kết thúc theo dõi
    "",               // Lần cảnh báo cuối
    "Bình thường",    // Trạng thái
    "Không",          // Bật báo cáo cuối ngày
    "17:30",          // Giờ gửi báo cáo
    ""                // Lần gửi báo cáo cuối
  ];
  sheet.appendRow(newRow);
  
  return {
    "Group ID": groupId,
    "Group Name": groupName || "",
    "Bật cảnh báo im lặng": "Không",
    "Số phút im lặng": 90,
    "Giờ bắt đầu theo dõi": "08:00",
    "Giờ kết thúc theo dõi": "21:00",
    "Lần cảnh báo cuối": "",
    "Trạng thái": "Bình thường",
    "Bật báo cáo cuối ngày": "Không",
    "Giờ gửi báo cáo": "17:30",
    "Lần gửi báo cáo cuối": "",
    rowIndex: sheet.getLastRow()
  };
}

function updateGroupSettingField(groupId, fieldName, value) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Group_Settings");
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(h) { return String(h).trim(); });
  var colGroupId = headers.indexOf("Group ID") + 1;
  var colField = headers.indexOf(fieldName) + 1;
  
  if (colGroupId === 0 || colField === 0) return;
  
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][colGroupId - 1]).trim() === groupId) {
      sheet.getRange(i + 1, colField).setValue(value);
      return;
    }
  }
}

function resetGroupSilentStatus(groupId) {
  updateGroupSettingField(groupId, "Trạng thái", "Bình thường");
}

function getLastGroupInteractionTime(groupId) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Interaction_Logs");
  if (!sheet || sheet.getLastRow() < 2) return null;
  
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(h) { return String(h).trim(); });
  
  var colGroupId = headers.indexOf("Group ID") + 1;
  var colTime = headers.indexOf("Thời gian") + 1;
  
  if (colGroupId === 0 || colTime === 0) return null;
  
  var lastTime = null;
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][colGroupId - 1]).trim() === groupId) {
      var timeVal = values[i][colTime - 1];
      var t = new Date(timeVal).getTime();
      if (!isNaN(t)) {
        if (!lastTime || t > lastTime) {
          lastTime = t;
        }
      }
    }
  }
  return lastTime;
}

function shouldAlertSilentGroup(groupSetting) {
  if (!groupSetting) return false;
  
  var enabled = String(groupSetting["Bật cảnh báo im lặng"]).trim();
  if (enabled !== "Có" && enabled !== "Yes" && enabled !== "true") return false;
  
  var tz = Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh";
  var now = new Date();
  
  // 1. Check working hours
  var currentStr = Utilities.formatDate(now, tz, "HH:mm");
  var start = String(groupSetting["Giờ bắt đầu theo dõi"] || "08:00").trim();
  var end = String(groupSetting["Giờ kết thúc theo dõi"] || "21:00").trim();
  
  var inRange = false;
  if (start <= end) {
    inRange = (currentStr >= start && currentStr <= end);
  } else {
    inRange = (currentStr >= start || currentStr <= end);
  }
  if (!inRange) return false;
  
  var groupId = groupSetting["Group ID"];
  if (!groupId) return false;
  
  // 2. Check last interaction time
  var lastInteraction = getLastGroupInteractionTime(groupId);
  if (!lastInteraction) return false;
  
  var silentMinutes = parseInt(groupSetting["Số phút im lặng"]) || 90;
  var diffMinutes = (now.getTime() - lastInteraction) / 60000;
  if (diffMinutes < silentMinutes) return false;
  
  // 3. Check cooldown
  var lastAlertVal = groupSetting["Lần cảnh báo cuối"];
  if (lastAlertVal) {
    var lastAlertTime = new Date(lastAlertVal).getTime();
    if (!isNaN(lastAlertTime)) {
      var minutesSinceLastAlert = (now.getTime() - lastAlertTime) / 60000;
      if (minutesSinceLastAlert < silentMinutes) {
        return false;
      }
    }
  }
  
  return true;
}

function updateLastSilentAlert(groupId) {
  var tz = Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh";
  var nowStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  updateGroupSettingField(groupId, "Lần cảnh báo cuối", nowStr);
  updateGroupSettingField(groupId, "Trạng thái", "Cảnh báo");
}

function checkSilentGroups() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Group_Settings");
    if (!sheet || sheet.getLastRow() < 2) return;
    
    var values = sheet.getDataRange().getValues();
    var headers = values[0].map(function(h) { return String(h).trim(); });
    var colGroupId = headers.indexOf("Group ID") + 1;
    if (colGroupId === 0) return;
    
    for (var i = 1; i < values.length; i++) {
      var groupId = String(values[i][colGroupId - 1]).trim();
      if (!groupId) continue;
      
      var setting = getGroupSettings(groupId);
      if (shouldAlertSilentGroup(setting)) {
        var silentMinutes = parseInt(setting["Số phút im lặng"]) || 90;
        var groupName = setting["Group Name"] || "nhóm";
        var msg = "⚠️ GROUP ĐANG IM LẶNG\n\n" +
                  "Nhóm \"" + groupName + "\" đã không có tương tác trong " + silentMinutes + " phút.\n" +
                  "QL/TC vui lòng kiểm tra tình hình vận hành hoặc nhắc nhân sự cập nhật tiến độ.";
                  
        var admins = getAdminUserIds();
        admins.forEach(function(adminId) {
          sendLinePush_Simple(adminId, msg);
        });
        updateLastSilentAlert(groupId);
      }
    }
    
    // Kiểm tra và gửi cảnh báo bất thường tự động
    try {
      checkAndSendAnomalyAlerts();
    } catch (anomErr) {
      writeLog("Lỗi checkAndSendAnomalyAlerts trong checkSilentGroups: " + anomErr.message, "WARN");
    }
  } catch (err) {
    writeLog("Lỗi checkSilentGroups: " + err.message, "ERROR");
  }
}

function setupSilentGroupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkSilentGroups') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkSilentGroups')
      .timeBased()
      .everyMinutes(15)
      .create();
  
  writeLog("Đã thiết lập trigger kiểm tra im lặng (mỗi 15 phút)", "INFO");
}

function setupDailyInteractionReportTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendDailyInteractionReports') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkAndSendDailyInteractionReports')
      .timeBased()
      .everyMinutes(15)
      .create();
  
  writeLog("Đã thiết lập trigger kiểm tra gửi báo cáo cuối ngày tự động (mỗi 15 phút)", "INFO");
}

function checkAndSendDailyInteractionReports() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Group_Settings");
    if (!sheet || sheet.getLastRow() < 2) return;
    
    var values = sheet.getDataRange().getValues();
    var headers = values[0].map(function(h) { return String(h).trim(); });
    
    var colGroupId = headers.indexOf("Group ID") + 1;
    var colEnabled = headers.indexOf("Bật báo cáo cuối ngày") + 1;
    var colTime = headers.indexOf("Giờ gửi báo cáo") + 1;
    var colLastSent = headers.indexOf("Lần gửi báo cáo cuối") + 1;
    
    if (colGroupId === 0 || colEnabled === 0 || colTime === 0 || colLastSent === 0) return;
    
    var tz = Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh";
    var now = new Date();
    var todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
    var currentStr = Utilities.formatDate(now, tz, "HH:mm");
    
    for (var i = 1; i < values.length; i++) {
      var groupId = String(values[i][colGroupId - 1]).trim();
      if (!groupId) continue;
      
      var enabled = String(values[i][colEnabled - 1]).trim();
      if (enabled !== "Có" && enabled !== "Yes" && enabled !== "true") continue;
      
      var targetTime = String(values[i][colTime - 1] || "17:30").trim();
      var lastSent = String(values[i][colLastSent - 1]).trim();
      
      if (currentStr >= targetTime && lastSent !== todayStr) {
        sendDailyInteractionReport(groupId);
      }
    }
  } catch (err) {
    writeLog("Lỗi checkAndSendDailyInteractionReports: " + err.message, "ERROR");
  }
}

function buildDailyInteractionReport(groupId) {
  var stats = getInteractionStats(groupId, 1);
  var groupName = getGroupName(groupId);
  
  var tz = Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh";
  var todayStr = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
  
  // 1. Active members ratio
  var activeCount = stats.activeCount;
  var known = getKnownGroupMembers(groupId);
  var totalKnown = Object.keys(known).length;
  if (totalKnown <= 0 || totalKnown < activeCount) {
    totalKnown = activeCount;
  }
  
  // 2. Task stats
  var tasks = getActiveTasksList();
  var totalTasks = 0;
  var completedTasks = 0;
  var overdueTasks = 0;
  var overdueAssignees = {};
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    if (String(row[0]).trim() === "") continue;
    if (String(row[5] || "").trim() !== groupId) continue;
    
    totalTasks++;
    var status = String(row[11] || "").trim();
    if (status === "Đã gửi" || status === "Đã hoàn thành") {
      completedTasks++;
    } else if (status === "Quá hạn") {
      overdueTasks++;
      var assigneeStr = String(row[6] || "").trim();
      if (assigneeStr) {
        var assignees = assigneeStr.split(",");
        assignees.forEach(function(uId) {
          var cleanId = uId.trim();
          if (cleanId) {
            overdueAssignees[cleanId] = (overdueAssignees[cleanId] || 0) + 1;
          }
        });
      }
    }
  }
  
  // 3. Top 3 interactions
  var allMembers = Object.keys(stats.members).map(function(userId) {
    return {
      name: stats.members[userId].name,
      score: stats.members[userId].score,
      total: stats.members[userId].total
    };
  });
  allMembers.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return b.total - a.total;
  });
  
  var top3Str = "";
  var top3 = allMembers.slice(0, 3);
  if (top3.length > 0) {
    top3.forEach(function(m, idx) {
      top3Str += (idx + 1) + ". " + m.name + " - " + m.score.toFixed(0) + " điểm\n";
    });
    top3Str = top3Str.trim();
  } else {
    top3Str = "(Không có tương tác)";
  }
  
  // 4. Need follow-up
  var needFollowUp = [];
  var silent = getSilentMembers(groupId, 1);
  silent.forEach(function(m) {
    var name = m.name || resolveMemberName(m.userId, groupId) || m.userId;
    needFollowUp.push("- " + name + ": chưa tương tác");
  });
  
  Object.keys(overdueAssignees).forEach(function(uId) {
    var name = resolveMemberName(uId, groupId) || uId;
    needFollowUp.push("- " + name + ": có việc quá hạn");
  });
  
  var followUpStr = "";
  if (needFollowUp.length > 0) {
    followUpStr = needFollowUp.join("\n");
  } else {
    followUpStr = "- Không có";
  }
  
  // 5. Comment
  var comment = "";
  var activeRatio = totalKnown > 0 ? (activeCount / totalKnown) : 0;
  if (activeRatio >= 0.8) {
    comment = "Nhóm hoạt động tốt";
  } else if (activeRatio >= 0.5) {
    comment = "Nhóm hoạt động trung bình";
  } else {
    comment = "Nhóm ít tương tác, cần nhắc nhở nhân sự tích cực hơn";
  }
  
  if (overdueTasks > 0) {
    comment += ", cần xử lý " + overdueTasks + " việc quá hạn trước khi kết ca.";
  } else {
    comment += ", không có việc quá hạn nào.";
  }
  
  var rep = "📊 BÁO CÁO TƯƠNG TÁC CUỐI NGÀY\n\n" +
            "Group: " + groupName + "\n" +
            "Ngày: " + todayStr + "\n\n" +
            "Tổng tương tác: " + stats.total + "\n" +
            "Thành viên hoạt động: " + activeCount + "/" + totalKnown + "\n" +
            "Việc hoàn tất: " + completedTasks + "/" + totalTasks + "\n" +
            "Việc quá hạn: " + overdueTasks + "\n\n" +
            "🏆 Top tương tác:\n" + top3Str + "\n\n" +
            "⚠️ Cần theo dõi:\n" + followUpStr + "\n\n" +
            "📌 Nhận xét:\n" + comment;
             
  return rep;
}

function sendDailyInteractionReport(groupId) {
  try {
    var rep = buildDailyInteractionReport(groupId);
    pushMessages(groupId, [{ type: "text", text: rep }], "Báo cáo tương tác cuối ngày");
    
    var tz = Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh";
    var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    markDailyReportSent(groupId, todayStr);
  } catch (e) {
    writeLog("Lỗi sendDailyInteractionReport cho nhóm " + groupId + ": " + e.message, "ERROR");
  }
}

function markDailyReportSent(groupId, date) {
  updateGroupSettingField(groupId, "Lần gửi báo cáo cuối", date);
}

function calculateGroupHealthScore(groupId, days) {
  if (!days) days = 1;
  var stats = getInteractionStats(groupId, days);
  
  var activeCount = stats.activeCount;
  var known = getKnownGroupMembers(groupId);
  var totalKnown = Object.keys(known).length;
  if (totalKnown <= 0 || totalKnown < activeCount) {
    totalKnown = activeCount;
  }
  
  var activeRatio = totalKnown > 0 ? (activeCount / totalKnown) : 1.0;
  var activeScore = activeRatio * 40;
  
  // Tasks stats
  var tasks = getActiveTasksList();
  var totalTasks = 0;
  var completedTasks = 0;
  var overdueTasks = 0;
  
  for (var i = 0; i < tasks.length; i++) {
    var row = tasks[i];
    if (String(row[0]).trim() === "") continue;
    if (String(row[5] || "").trim() !== groupId) continue;
    
    totalTasks++;
    var status = String(row[11] || "").trim();
    if (status === "Đã gửi" || status === "Đã hoàn thành") {
      completedTasks++;
    } else if (status === "Quá hạn") {
      overdueTasks++;
    }
  }
  
  var completionRatio = totalTasks > 0 ? (completedTasks / totalTasks) : 1.0;
  var taskScore = completionRatio * 40;
  
  // Interaction density
  var totalInteractions = stats.total;
  var avgInteractions = totalKnown > 0 ? (totalInteractions / totalKnown) : 0;
  var densityScore = Math.min(20, avgInteractions * 2);
  
  // Penalties
  var silent = getSilentMembers(groupId, days);
  var silentCount = silent.length;
  var silentPenalty = silentCount * 2;
  var overduePenalty = overdueTasks * 5;
  var totalPenalty = silentPenalty + overduePenalty;
  
  var rawScore = activeScore + taskScore + densityScore - totalPenalty;
  var finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  
  return {
    score: finalScore,
    activeScore: Math.round(activeScore),
    taskScore: Math.round(taskScore),
    densityScore: Math.round(densityScore),
    penalty: Math.round(totalPenalty),
    activeCount: activeCount,
    totalKnown: totalKnown,
    completedTasks: completedTasks,
    totalTasks: totalTasks,
    overdueTasks: overdueTasks,
    silentCount: silentCount,
    avgInteractions: avgInteractions
  };
}

function classifyGroupHealth(score) {
  if (score >= 90) return "RẤT TỐT";
  if (score >= 70) return "ỔN";
  if (score >= 50) return "CẦN THEO DÕI";
  return "CẦN CAN THIỆP";
}

function buildGroupHealthInsights(data) {
  var strengths = [];
  var improvements = [];
  
  // Strengths
  var completionRatio = data.totalTasks > 0 ? (data.completedTasks / data.totalTasks) : 1.0;
  if (completionRatio >= 0.8) {
    strengths.push("Tỷ lệ hoàn thành việc tốt");
  }
  
  var activeRatio = data.totalKnown > 0 ? (data.activeCount / data.totalKnown) : 1.0;
  if (activeRatio >= 0.8) {
    strengths.push("Thành viên tương tác đều, tích cực");
  } else if (data.avgInteractions >= 5) {
    strengths.push("Mật độ tương tác trung bình cao");
  }
  
  if (data.overdueTasks === 0 && data.totalTasks > 0) {
    strengths.push("Không trễ hạn công việc nào");
  }
  
  if (strengths.length === 0) {
    strengths.push("Đang duy trì vận hành cơ bản");
  }
  
  // Improvements
  if (data.silentCount > 0) {
    improvements.push(data.silentCount + " thành viên ít tương tác");
  }
  if (data.overdueTasks > 0) {
    improvements.push(data.overdueTasks + " việc quá hạn chưa xử lý");
  }
  var completionRate = data.totalTasks > 0 ? (data.completedTasks / data.totalTasks) : 1.0;
  if (completionRate < 0.5 && data.totalTasks > 0) {
    improvements.push("Tỷ lệ hoàn thành công việc thấp (" + Math.round(completionRate * 100) + "%)");
  }
  
  if (improvements.length === 0) {
    improvements.push("Không có vấn đề nổi cộm cần cải thiện");
  }
  
  return {
    strengths: strengths,
    improvements: improvements
  };
}

function buildGroupHealthReport(groupId, days) {
  if (!days) days = 1;
  var data = calculateGroupHealthScore(groupId, days);
  var classification = classifyGroupHealth(data.score);
  var insights = buildGroupHealthInsights(data);
  
  var emoji = "❤️";
  if (data.score >= 90) emoji = "💚";
  else if (data.score >= 70) emoji = "💛";
  else if (data.score >= 50) emoji = "🧡";
  else emoji = "💔";
  
  var rangeStr = days === 1 ? "hôm nay" : days + " ngày qua";
  
  var strengthsStr = insights.strengths.map(function(s) { return "- " + s; }).join("\n");
  var improvementsStr = insights.improvements.map(function(s) { return "- " + s; }).join("\n");
  
  var rep = emoji + " SỨC KHỎE GROUP (" + rangeStr + "): " + data.score + "/100 - " + classification + "\n\n" +
            "Điểm thành phần:\n" +
            "- Active: " + data.activeScore + "/40\n" +
            "- Hoàn thành việc: " + data.taskScore + "/40\n" +
            "- Tương tác/người: " + data.densityScore + "/20\n" +
            "- Điểm phạt: -" + data.penalty + "\n\n" +
            "Điểm mạnh:\n" + strengthsStr + "\n\n" +
            "Cần cải thiện:\n" + improvementsStr;
            
  return rep;
}

function SETUP_DASHBOARD_TUONG_TAC() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Dashboard_TuongTac");
  if (sheet) {
    try {
      sheet.clear();
    } catch (e) {
      ss.deleteSheet(sheet);
      sheet = ss.insertSheet("Dashboard_TuongTac");
    }
  } else {
    sheet = ss.insertSheet("Dashboard_TuongTac");
  }
  
  // Format columns width
  sheet.setColumnWidth(1, 180); // Col A
  sheet.setColumnWidth(2, 80);  // Col B
  sheet.setColumnWidth(3, 180); // Col C
  sheet.setColumnWidth(4, 80);  // Col D
  sheet.setColumnWidth(5, 180); // Col E
  sheet.setColumnWidth(6, 80);  // Col F
  sheet.setColumnWidth(7, 120); // Col G
  sheet.setColumnWidth(8, 120); // Col H
  
  // Row 1: Header Banner
  sheet.getRange("A1:H1").merge()
       .setValue("📊 DASHBOARD THỐNG KÊ TƯƠNG TÁC & HIỆU SUẤT ĐỘI NHÓM")
       .setFontSize(16)
       .setFontWeight("bold")
       .setFontColor("white")
       .setBackground("#0F9D58") // Google green
       .setHorizontalAlignment("center")
       .setVerticalAlignment("middle");
  sheet.setRowHeight(1, 50);
  
  // Row 3: Filter Header
  sheet.getRange("A3").setValue("Bộ lọc:").setFontWeight("bold").setFontSize(11);
  sheet.getRange("B3").setValue("Chọn Group (ID/Tất cả)").setFontWeight("bold");
  sheet.getRange("C3").setValue("Phạm vi ngày").setFontWeight("bold");
  
  // Row 4: Filter Input
  sheet.getRange("B4").setValue("Tất cả").setHorizontalAlignment("center");
  sheet.getRange("C4").setValue("Hôm nay").setHorizontalAlignment("center");
  
  // Dropdown for C4
  try {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(["Hôm nay", "7 ngày", "30 ngày"], true).build();
    sheet.getRange("C4").setDataValidation(rule);
  } catch (err) {}
  
  // Row 6: KPI Header Cards
  var kpis = [
    "Tổng tương tác",
    "Thành viên active",
    "Tỷ lệ active",
    "Tổng điểm tương tác",
    "Việc hoàn tất",
    "Việc quá hạn",
    "Ảnh nghiệm thu",
    "Health Score"
  ];
  sheet.getRange(6, 1, 1, 8).setValues([kpis])
       .setFontWeight("bold")
       .setBackground("#E8F0FE") // Light blue
       .setFontColor("#1A73E8")
       .setHorizontalAlignment("center")
       .setVerticalAlignment("middle");
  sheet.setRowHeight(6, 25);
  
  // Row 7: KPI Values
  sheet.getRange(7, 1, 1, 8)
       .setFontSize(14)
       .setFontWeight("bold")
       .setHorizontalAlignment("center")
       .setVerticalAlignment("middle");
  sheet.setRowHeight(7, 35);
  
  // Row 9: Top 10 Header
  sheet.getRange("A9:H9").merge()
       .setValue("🏆 TOP 10 THÀNH VIÊN HOẠT ĐỘNG XUẤT SẮC")
       .setFontWeight("bold")
       .setBackground("#4285F4") // Google blue
       .setFontColor("white")
       .setHorizontalAlignment("left")
       .setVerticalAlignment("middle");
  sheet.setRowHeight(9, 25);
  
  // Row 10: Top 10 Columns
  sheet.getRange(10, 1, 1, 8).setValues([[
    "Top tương tác", "Lượt", "Top hoàn tất việc", "Số việc", "Top gửi ảnh nghiệm thu", "Số ảnh", "", ""
  ]])
  .setFontWeight("bold")
  .setBackground("#F1F3F4")
  .setHorizontalAlignment("center");
  
  // Row 22: Bottom 10 Header
  sheet.getRange("A22:H22").merge()
       .setValue("⚠️ BOTTOM 10 / THÀNH VIÊN CẦN THEO DÕI")
       .setFontWeight("bold")
       .setBackground("#EA4335") // Google red
       .setFontColor("white")
       .setHorizontalAlignment("left")
       .setVerticalAlignment("middle");
  sheet.setRowHeight(22, 25);
  
  // Row 23: Bottom 10 Columns
  sheet.getRange(23, 1, 1, 8).setValues([[
    "Ít tương tác", "Lượt", "Chưa tương tác", "Trạng thái", "Quá hạn nhiều", "Số việc", "", ""
  ]])
  .setFontWeight("bold")
  .setBackground("#F1F3F4")
  .setHorizontalAlignment("center");
  
  // Row 35: Hourly Header
  sheet.getRange("A35:H35").merge()
       .setValue("🕒 PHÂN TÍCH KHUNG GIỜ TƯƠNG TÁC MẠNH")
       .setFontWeight("bold")
       .setBackground("#F4B400") // Google yellow
       .setFontColor("white")
       .setHorizontalAlignment("left")
       .setVerticalAlignment("middle");
  sheet.setRowHeight(35, 25);
  
  // Row 36: Hourly Columns
  sheet.getRange(36, 1, 1, 8).setValues([[
    "Khung giờ", "Số tương tác", "", "", "", "", "", ""
  ]])
  .setFontWeight("bold")
  .setBackground("#F1F3F4")
  .setHorizontalAlignment("center");
  
  // Row 51: Auto Comment Header
  sheet.getRange("A51:H51").merge()
       .setValue("📌 BÁO CÁO VÀ NHẬN XÉT TỰ ĐỘNG CỦA HỆ THỐNG")
       .setFontWeight("bold")
       .setBackground("#7B1FA2") // Purple
       .setFontColor("white")
       .setHorizontalAlignment("left")
       .setVerticalAlignment("middle");
  sheet.setRowHeight(51, 25);
  
  // Call update to populate it initially
  UPDATE_DASHBOARD_TUONG_TAC();
}

function UPDATE_DASHBOARD_TUONG_TAC() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Dashboard_TuongTac");
  if (!sheet) {
    SETUP_DASHBOARD_TUONG_TAC();
    return;
  }
  
  var groupId = String(sheet.getRange("B4").getValue()).trim();
  var rangeOption = String(sheet.getRange("C4").getValue()).trim();
  
  var days = 1;
  if (rangeOption === "7 ngày") {
    days = 7;
  } else if (rangeOption === "30 ngày") {
    days = 30;
  }
  
  var data = getDashboardInteractionData(groupId, days);
  
  // Write KPI values in Row 7
  var activeRatioStr = (data.activeRatio * 100).toFixed(1) + "%";
  var values = [
    data.totalInteractions,
    data.activeCount + "/" + data.totalKnown,
    activeRatioStr,
    data.totalPoints.toFixed(1),
    data.completedTasks + "/" + data.totalTasks,
    data.overdueTasks,
    data.imageProofCount,
    data.healthScore + "/100"
  ];
  sheet.getRange(7, 1, 1, 8).setValues([values]);
  
  // Build and print tables
  buildDashboardTables(sheet, data);
}

function getDashboardInteractionData(groupId, days) {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("Interaction_Logs");
  var logValues = logSheet ? logSheet.getDataRange().getValues() : [];
  var taskSheet = ss.getSheetByName("Sự kiện");
  var taskValues = taskSheet ? taskSheet.getDataRange().getValues() : [];
  
  var now = new Date();
  var cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000);
  cutoff.setHours(0, 0, 0, 0); // Start of day of cutoff
  
  var activeMembers = {};
  var totalInteractions = 0;
  var totalPoints = 0;
  var imageProofCount = 0;
  
  var hourlyCounts = {};
  for (var h = 8; h <= 20; h++) {
    var key = (h < 10 ? "0" + h : h) + ":00 - " + (h + 1 < 10 ? "0" + (h + 1) : h + 1) + ":00";
    hourlyCounts[key] = 0;
  }
  
  var headersLog = logValues.length > 0 ? logValues[0].map(function(h) { return String(h).trim(); }) : [];
  var colTimeLog = headersLog.indexOf("Thời gian");
  var colGroupIdLog = headersLog.indexOf("Group ID");
  var colUserIdLog = headersLog.indexOf("User ID");
  var colUserNameLog = headersLog.indexOf("Tên Line");
  var colTypeLog = headersLog.indexOf("Loại tương tác");
  var colScoreLog = headersLog.indexOf("Điểm tương tác");
  
  for (var i = 1; i < logValues.length; i++) {
    var row = logValues[i];
    var timeVal = new Date(row[colTimeLog]);
    if (isNaN(timeVal.getTime()) || timeVal < cutoff) continue;
    
    var gId = String(row[colGroupIdLog] || "").trim();
    if (groupId && groupId !== "Tất cả" && gId !== groupId) continue;
    
    totalInteractions++;
    var score = parseFloat(row[colScoreLog]) || 0;
    totalPoints += score;
    
    var userId = String(row[colUserIdLog] || "").trim();
    var userName = String(row[colUserNameLog] || "").trim() || userId;
    var type = String(row[colTypeLog] || "").trim();
    
    if (type === "image_proof") {
      imageProofCount++;
    }
    
    if (userId) {
      if (!activeMembers[userId]) {
        activeMembers[userId] = { name: userName, interactions: 0, points: 0, completed: 0, proofs: 0, overdue: 0 };
      }
      activeMembers[userId].interactions++;
      activeMembers[userId].points += score;
      if (type === "image_proof") {
        activeMembers[userId].proofs++;
      }
    }
    
    // Hourly analysis (only messages between 08:00 and 21:00)
    var hour = timeVal.getHours();
    if (hour >= 8 && hour <= 20) {
      var hourKey = (hour < 10 ? "0" + hour : hour) + ":00 - " + (hour + 1 < 10 ? "0" + (hour + 1) : hour + 1) + ":00";
      hourlyCounts[hourKey] = (hourlyCounts[hourKey] || 0) + 1;
    }
  }
  
  // Tasks stats
  var totalTasks = 0;
  var completedTasks = 0;
  var overdueTasks = 0;
  
  var headersTask = taskValues.length > 0 ? taskValues[0].map(function(h) { return String(h).trim(); }) : [];
  var colGroupIdTask = headersTask.indexOf("Nhóm nhận");
  var colAssigneeTask = headersTask.indexOf("Người phụ trách");
  var colStatusTask = headersTask.indexOf("Trạng thái");
  
  for (var i = 1; i < taskValues.length; i++) {
    var row = taskValues[i];
    var gId = String(row[colGroupIdTask] || "").trim();
    if (groupId && groupId !== "Tất cả" && gId !== groupId) continue;
    
    totalTasks++;
    var status = String(row[colStatusTask] || "").trim();
    var isCompleted = (status === "Đã gửi" || status === "Đã hoàn thành");
    var isOverdue = (status === "Quá hạn");
    
    if (isCompleted) completedTasks++;
    if (isOverdue) overdueTasks++;
    
    var assigneeStr = String(row[colAssigneeTask] || "").trim();
    if (assigneeStr) {
      var assignees = assigneeStr.split(",");
      assignees.forEach(function(uId) {
        var cleanId = uId.trim();
        if (cleanId) {
          if (!activeMembers[cleanId]) {
            activeMembers[cleanId] = { name: cleanId, interactions: 0, points: 0, completed: 0, proofs: 0, overdue: 0 };
          }
          if (isCompleted) activeMembers[cleanId].completed++;
          if (isOverdue) activeMembers[cleanId].overdue++;
        }
      });
    }
  }
  
  var known = {};
  if (groupId && groupId !== "Tất cả") {
    known = getKnownGroupMembers(groupId);
  } else {
    // Collect all known members across all groups or from ID_Member sheet
    var memberSheet = ss.getSheetByName("ID_Member");
    var memberValues = memberSheet ? memberSheet.getDataRange().getValues() : [];
    for (var i = 1; i < memberValues.length; i++) {
      var id = String(memberValues[i][1]).trim();
      var name = String(memberValues[i][0]).trim();
      if (id) {
        known[id] = name;
      }
    }
  }
  
  var totalKnown = Object.keys(known).length;
  var activeCount = Object.keys(activeMembers).filter(function(id) { return activeMembers[id].interactions > 0; }).length;
  if (totalKnown <= 0 || totalKnown < activeCount) {
    totalKnown = activeCount;
  }
  var activeRatio = totalKnown > 0 ? (activeCount / totalKnown) : 0;
  
  // Compute group health score
  var healthScore = 0;
  if (groupId && groupId !== "Tất cả") {
    var healthObj = calculateGroupHealthScore(groupId, days);
    healthScore = healthObj.score;
  } else {
    // Average health score across all groups that have settings
    var settingsSheet = ss.getSheetByName("Group_Settings");
    var settingsValues = settingsSheet ? settingsSheet.getDataRange().getValues() : [];
    var totalHealth = 0;
    var countHealth = 0;
    for (var i = 1; i < settingsValues.length; i++) {
      var gId = String(settingsValues[i][0]).trim();
      if (gId) {
        var hObj = calculateGroupHealthScore(gId, days);
        totalHealth += hObj.score;
        countHealth++;
      }
    }
    healthScore = countHealth > 0 ? Math.round(totalHealth / countHealth) : 100;
  }
  
  return {
    totalInteractions: totalInteractions,
    activeCount: activeCount,
    totalKnown: totalKnown,
    activeRatio: activeRatio,
    totalPoints: totalPoints,
    completedTasks: completedTasks,
    totalTasks: totalTasks,
    overdueTasks: overdueTasks,
    imageProofCount: imageProofCount,
    healthScore: healthScore,
    activeMembers: activeMembers,
    known: known,
    hourlyCounts: hourlyCounts
  };
}

function buildDashboardTables(sheet, data) {
  var activeMembers = data.activeMembers;
  var known = data.known;
  
  // 1. Top 10 Interacting
  var listInteractions = [];
  // 2. Top 10 Completed Tasks
  var listCompleted = [];
  // 3. Top 10 Image Proofs
  var listProofs = [];
  
  Object.keys(activeMembers).forEach(function(userId) {
    var m = activeMembers[userId];
    var resolvedName = resolveMemberName(userId) || m.name || userId;
    listInteractions.push({ name: resolvedName, value: m.interactions });
    listCompleted.push({ name: resolvedName, value: m.completed });
    listProofs.push({ name: resolvedName, value: m.proofs });
  });
  
  listInteractions.sort(function(a, b) { return b.value - a.value; });
  listCompleted.sort(function(a, b) { return b.value - a.value; });
  listProofs.sort(function(a, b) { return b.value - a.value; });
  
  // 4. Bottom 10 Interacting
  var listLeastInteractions = listInteractions.slice().reverse().filter(function(x) { return x.value > 0; });
  
  // 5. Silent members (Chưa tương tác)
  var listSilent = [];
  Object.keys(known).forEach(function(userId) {
    if (!activeMembers[userId] || activeMembers[userId].interactions === 0) {
      listSilent.push({ name: known[userId] || userId, value: "Chưa tương tác" });
    }
  });
  
  // 6. Overdue members (Quá hạn nhiều)
  var listOverdue = [];
  Object.keys(activeMembers).forEach(function(userId) {
    var m = activeMembers[userId];
    if (m.overdue > 0) {
      var resolvedName = resolveMemberName(userId) || m.name || userId;
      listOverdue.push({ name: resolvedName, value: m.overdue });
    }
  });
  listOverdue.sort(function(a, b) { return b.value - a.value; });
  
  // Fill Top 10 rows (11 to 20)
  var topRows = [];
  for (var i = 0; i < 10; i++) {
    var row = [
      (listInteractions[i] ? listInteractions[i].name : ""),
      (listInteractions[i] ? listInteractions[i].value : ""),
      (listCompleted[i] ? listCompleted[i].name : ""),
      (listCompleted[i] ? listCompleted[i].value : ""),
      (listProofs[i] ? listProofs[i].name : ""),
      (listProofs[i] ? listProofs[i].value : ""),
      "", ""
    ];
    topRows.push(row);
  }
  sheet.getRange(11, 1, 10, 8).setValues(topRows);
  
  // Fill Bottom 10 rows (24 to 33)
  var bottomRows = [];
  for (var i = 0; i < 10; i++) {
    var row = [
      (listLeastInteractions[i] ? listLeastInteractions[i].name : ""),
      (listLeastInteractions[i] ? listLeastInteractions[i].value : ""),
      (listSilent[i] ? listSilent[i].name : ""),
      (listSilent[i] ? listSilent[i].value : ""),
      (listOverdue[i] ? listOverdue[i].name : ""),
      (listOverdue[i] ? listOverdue[i].value : ""),
      "", ""
    ];
    bottomRows.push(row);
  }
  sheet.getRange(24, 1, 10, 8).setValues(bottomRows);
  
  // Fill Hourly rows (37 to 49)
  var hourlyRows = [];
  Object.keys(data.hourlyCounts).forEach(function(key) {
    hourlyRows.push([key, data.hourlyCounts[key], "", "", "", "", "", ""]);
  });
  sheet.getRange(37, 1, 13, 8).setValues(hourlyRows);
  
  // Fill Auto-comment/Insights (52 to 56)
  var classification = classifyGroupHealth(data.healthScore);
  
  // Find strongest hour
  var strongestHour = "";
  var maxHourVal = -1;
  Object.keys(data.hourlyCounts).forEach(function(key) {
    if (data.hourlyCounts[key] > maxHourVal) {
      maxHourVal = data.hourlyCounts[key];
      strongestHour = key;
    }
  });
  if (maxHourVal <= 0) strongestHour = "Không có tương tác";
  
  var followUpList = [];
  listSilent.slice(0, 3).forEach(function(s) {
    followUpList.push(s.name);
  });
  var followUpStr = followUpList.length > 0 ? followUpList.join(", ") : "Không có";
  
  var overdueCount = data.overdueTasks;
  var commentText = "• Đánh giá chung: Nhóm hoạt động " + (data.healthScore >= 90 ? "Tốt" : (data.healthScore >= 70 ? "Trung bình - Ổn" : "Yếu - Cần nhắc nhở/chấn chỉnh")) + " (Health Score: " + data.healthScore + "/100 - " + classification + ")\n" +
                    "• Khung giờ tương tác mạnh nhất: " + strongestHour + " (" + maxHourVal + " tương tác)\n" +
                    "• Nhân sự cần theo dõi sát sao (Chưa tương tác): " + followUpStr + "\n" +
                    "• Công việc quá hạn cần xử lý gấp: " + overdueCount + " việc";
                    
  try {
    sheet.getRange(52, 1, 5, 8).merge().setValue(commentText).setVerticalAlignment("top").setWrap(true);
  } catch (err) {}
}

function detectInteractionAnomalies(groupId) {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("Interaction_Logs");
  var logValues = logSheet ? logSheet.getDataRange().getValues() : [];
  var settingsSheet = ss.getSheetByName("Group_Settings");
  var settingsValues = settingsSheet ? settingsSheet.getDataRange().getValues() : [];
  
  var thresholdDrop = 30; // default 30%
  var silentMinutes = 180; // default 3 hours (180 mins)
  var isSilentAlertEnabled = false;
  var trackStartHour = 8;
  var trackEndHour = 18;
  
  if (settingsSheet && settingsValues.length > 0) {
    var headersSettings = settingsValues[0].map(function(h) { return String(h).trim(); });
    var colGId = headersSettings.indexOf("Group ID");
    var colSilentMinutes = headersSettings.indexOf("Số phút im lặng");
    var colTrackStart = headersSettings.indexOf("Giờ bắt đầu theo dõi");
    var colTrackEnd = headersSettings.indexOf("Giờ kết thúc theo dõi");
    var colDropPercent = headersSettings.indexOf("Ngưỡng giảm tương tác (%)");
    var colSilentAlert = headersSettings.indexOf("Bật cảnh báo im lặng");
    
    for (var i = 1; i < settingsValues.length; i++) {
      if (String(settingsValues[i][colGId]).trim() === groupId) {
        if (colDropPercent !== -1 && settingsValues[i][colDropPercent] !== "") {
          thresholdDrop = parseFloat(settingsValues[i][colDropPercent]) || 30;
        }
        if (colSilentMinutes !== -1 && settingsValues[i][colSilentMinutes] !== "") {
          silentMinutes = parseFloat(settingsValues[i][colSilentMinutes]) || 180;
        }
        if (colTrackStart !== -1 && settingsValues[i][colTrackStart] !== "") {
          trackStartHour = parseInt(settingsValues[i][colTrackStart], 10) || 8;
        }
        if (colTrackEnd !== -1 && settingsValues[i][colTrackEnd] !== "") {
          trackEndHour = parseInt(settingsValues[i][colTrackEnd], 10) || 18;
        }
        if (colSilentAlert !== -1) {
          var sAlertVal = String(settingsValues[i][colSilentAlert]).trim();
          isSilentAlertEnabled = (sAlertVal === "Bật" || sAlertVal === "Có" || sAlertVal === "Yes");
        }
        break;
      }
    }
  }
  
  var now = new Date();
  var todayStart = new Date(now.getTime());
  todayStart.setHours(0,0,0,0);
  
  var start7DaysAgo = new Date(todayStart.getTime() - 7 * 24 * 3600 * 1000);
  
  var dailyCounts = {};
  for (var d = 1; d <= 7; d++) {
    var dateKey = Utilities.formatDate(new Date(todayStart.getTime() - d * 24 * 3600 * 1000), Session.getScriptTimeZone(), "yyyy-MM-dd");
    dailyCounts[dateKey] = 0;
  }
  
  var todayCount = 0;
  var memberLast7DaysCounts = {};
  var memberTodayCounts = {};
  var lastInteractionTime = null;
  
  var headersLog = logValues.length > 0 ? logValues[0].map(function(h) { return String(h).trim(); }) : [];
  var colTime = headersLog.indexOf("Thời gian");
  var colGIdLog = headersLog.indexOf("Group ID");
  var colUserId = headersLog.indexOf("User ID");
  
  for (var i = 1; i < logValues.length; i++) {
    var row = logValues[i];
    var gId = String(row[colGIdLog] || "").trim();
    if (gId !== groupId) continue;
    
    var timeVal = new Date(row[colTime]);
    if (isNaN(timeVal.getTime())) continue;
    
    var uId = String(row[colUserId] || "").trim();
    if (!uId) continue;
    
    var isToday = timeVal >= todayStart;
    
    if (isToday) {
      todayCount++;
      memberTodayCounts[uId] = (memberTodayCounts[uId] || 0) + 1;
      if (!lastInteractionTime || timeVal > lastInteractionTime) {
        lastInteractionTime = timeVal;
      }
    } else if (timeVal >= start7DaysAgo) {
      var dateKey = Utilities.formatDate(timeVal, Session.getScriptTimeZone(), "yyyy-MM-dd");
      if (dailyCounts[dateKey] !== undefined) {
        dailyCounts[dateKey]++;
      }
      memberLast7DaysCounts[uId] = (memberLast7DaysCounts[uId] || 0) + 1;
    }
  }
  
  var totalHistorical = 0;
  Object.keys(dailyCounts).forEach(function(key) {
    totalHistorical += dailyCounts[key];
  });
  var avgDaily = totalHistorical / 7;
  
  var anomalies = [];
  
  // 1. Group giảm tương tác mạnh so với trung bình 7 ngày
  if (avgDaily >= 3 && todayCount < avgDaily) {
    var dropPercent = Math.round(((avgDaily - todayCount) / avgDaily) * 100);
    if (dropPercent >= thresholdDrop) {
      anomalies.push("Group giảm tương tác " + dropPercent + "% so với trung bình 7 ngày (" + todayCount + " so với trung bình " + avgDaily.toFixed(1) + ").");
    }
  }
  
  // 2. Thành viên thường tương tác nhiều nhưng hôm nay im lặng
  Object.keys(memberLast7DaysCounts).forEach(function(uId) {
    var histCount = memberLast7DaysCounts[uId];
    if (histCount >= 3 && !memberTodayCounts[uId]) {
      var resolvedName = resolveMemberName(uId, groupId);
      anomalies.push("Thành viên " + resolvedName + " thường tương tác nhiều nhưng hôm nay không tương tác.");
    }
  });
  
  // 3. Im lặng trong giờ làm việc
  var currentHour = now.getHours();
  var currentMin = now.getMinutes();
  var isInWorkingHours = currentHour >= trackStartHour && (currentHour < trackEndHour || (currentHour === trackEndHour && currentMin === 0));
  
  if (isSilentAlertEnabled && isInWorkingHours) {
    var compareTime = lastInteractionTime ? lastInteractionTime : todayStart;
    var minutesSilent = Math.round((now.getTime() - compareTime.getTime()) / (60 * 1000));
    if (minutesSilent >= silentMinutes) {
      anomalies.push("Group im lặng trong giờ làm việc (" + minutesSilent + " phút).");
    }
  }
  
  return anomalies;
}

function detectTaskAnomalies(groupId) {
  var ss = getSpreadsheet();
  var taskSheet = ss.getSheetByName("Sự kiện");
  var taskValues = taskSheet ? taskSheet.getDataRange().getValues() : [];
  var logSheet = ss.getSheetByName("Interaction_Logs");
  var logValues = logSheet ? logSheet.getDataRange().getValues() : [];
  var settingsSheet = ss.getSheetByName("Group_Settings");
  var settingsValues = settingsSheet ? settingsSheet.getDataRange().getValues() : [];
  
  var thresholdOverdue = 2; // default 2
  
  if (settingsSheet && settingsValues.length > 0) {
    var headersSettings = settingsValues[0].map(function(h) { return String(h).trim(); });
    var colGId = headersSettings.indexOf("Group ID");
    var colOverdueTaskLimit = headersSettings.indexOf("Ngưỡng việc quá hạn");
    for (var i = 1; i < settingsValues.length; i++) {
      if (String(settingsValues[i][colGId]).trim() === groupId) {
        if (colOverdueTaskLimit !== -1 && settingsValues[i][colOverdueTaskLimit] !== "") {
          thresholdOverdue = parseInt(settingsValues[i][colOverdueTaskLimit], 10) || 2;
        }
        break;
      }
    }
  }
  
  var now = new Date();
  var todayStart = new Date(now.getTime());
  todayStart.setHours(0,0,0,0);
  
  var anomalies = [];
  var overdueCountByAssignee = {};
  var pendingTasksAssignees = {};
  var totalTasksToday = 0;
  var completedTasksToday = 0;
  var overdueTasksToday = 0;
  
  var headersTask = taskValues.length > 0 ? taskValues[0].map(function(h) { return String(h).trim(); }) : [];
  var colTaskName = headersTask.indexOf("Tên sự kiện");
  var colGroupId = headersTask.indexOf("Nhóm nhận");
  var colAssignee = headersTask.indexOf("Người phụ trách");
  var colStatus = headersTask.indexOf("Trạng thái");
  var colRemindCount = headersTask.indexOf("Số lần nhắc");
  var colDeadline = headersTask.indexOf("Deadline");
  
  for (var i = 1; i < taskValues.length; i++) {
    var row = taskValues[i];
    var gId = String(row[colGroupId] || "").trim();
    if (gId !== groupId) continue;
    
    var taskName = String(row[colTaskName] || "").trim();
    var status = String(row[colStatus] || "").trim();
    var remindCount = parseInt(row[colRemindCount], 10) || 0;
    
    var isCompleted = (status === "Đã gửi" || status === "Đã hoàn thành");
    var isOverdue = (status === "Quá hạn");
    
    // Check if task is active or modified/deadline today
    var dlVal = row[colDeadline] ? new Date(row[colDeadline]) : null;
    var isTodayTask = false;
    if (dlVal && !isNaN(dlVal.getTime())) {
      isTodayTask = dlVal >= todayStart;
    } else {
      isTodayTask = true;
    }
    
    if (isTodayTask) {
      totalTasksToday++;
      if (isCompleted) completedTasksToday++;
      if (isOverdue) overdueTasksToday++;
    }
    
    // 3. Một task bị nhắc quá 3 lần chưa xử lý
    if (!isCompleted && remindCount > 3) {
      anomalies.push("Task \"" + taskName + "\" bị nhắc " + remindCount + " lần chưa xử lý.");
    }
    
    var assigneeStr = String(row[colAssignee] || "").trim();
    if (assigneeStr && !isCompleted) {
      var assignees = assigneeStr.split(",");
      assignees.forEach(function(uId) {
        var cleanId = uId.trim();
        if (cleanId) {
          pendingTasksAssignees[cleanId] = true;
          if (isOverdue) {
            overdueCountByAssignee[cleanId] = (overdueCountByAssignee[cleanId] || 0) + 1;
          }
        }
      });
    }
  }
  
  // 4. Một người có nhiều việc quá hạn
  Object.keys(overdueCountByAssignee).forEach(function(uId) {
    var ovCount = overdueCountByAssignee[uId];
    if (ovCount >= thresholdOverdue) {
      var resolvedName = resolveMemberName(uId, groupId);
      anomalies.push("Nhân sự " + resolvedName + " có " + ovCount + " việc quá hạn.");
    }
  });
  
  // 5. Một người nhận việc nhưng không phản hồi
  var memberTodayCounts = {};
  var headersLog = logValues.length > 0 ? logValues[0].map(function(h) { return String(h).trim(); }) : [];
  var colTimeLog = headersLog.indexOf("Thời gian");
  var colGIdLog = headersLog.indexOf("Group ID");
  var colUserIdLog = headersLog.indexOf("User ID");
  
  for (var i = 1; i < logValues.length; i++) {
    var row = logValues[i];
    var gId = String(row[colGIdLog] || "").trim();
    if (gId !== groupId) continue;
    var timeVal = new Date(row[colTimeLog]);
    if (isNaN(timeVal.getTime()) || timeVal < todayStart) continue;
    var uId = String(row[colUserIdLog] || "").trim();
    if (uId) {
      memberTodayCounts[uId] = (memberTodayCounts[uId] || 0) + 1;
    }
  }
  
  Object.keys(pendingTasksAssignees).forEach(function(uId) {
    if (!memberTodayCounts[uId]) {
      var resolvedName = resolveMemberName(uId, groupId);
      anomalies.push("Nhân sự " + resolvedName + " nhận việc nhưng không có tương tác phản hồi hôm nay.");
    }
  });
  
  // 7. Số việc quá hạn tăng bất thường
  if (overdueTasksToday > 0) {
    anomalies.push("Có " + overdueTasksToday + " việc chuyển trạng thái quá hạn hôm nay.");
  }
  
  // 8. Tỷ lệ hoàn tất trong ngày dưới 70%
  if (totalTasksToday > 0) {
    var completionRate = completedTasksToday / totalTasksToday;
    if (completionRate < 0.70) {
      var percentRate = Math.round(completionRate * 100);
      anomalies.push("Tỷ lệ hoàn thành công việc hôm nay ở mức thấp (" + percentRate + "%).");
    }
  }
  
  return anomalies;
}

function buildAnomalyReport(groupId) {
  var ss = getSpreadsheet();
  var groupName = "Nhóm";
  var settingsSheet = ss.getSheetByName("Group_Settings");
  var settingsValues = settingsSheet ? settingsSheet.getDataRange().getValues() : [];
  if (settingsSheet && settingsValues.length > 0) {
    var headersSettings = settingsValues[0].map(function(h) { return String(h).trim(); });
    var colGId = headersSettings.indexOf("Group ID");
    var colGName = headersSettings.indexOf("Group Name");
    for (var i = 1; i < settingsValues.length; i++) {
      if (String(settingsValues[i][colGId]).trim() === groupId) {
        groupName = String(settingsValues[i][colGName] || groupName).trim();
        break;
      }
    }
  }
  
  var anomalies = [];
  try {
    anomalies = anomalies.concat(detectInteractionAnomalies(groupId));
  } catch (err) {
    writeLog("Error in detectInteractionAnomalies: " + err.toString(), "WARN");
  }
  
  try {
    anomalies = anomalies.concat(detectTaskAnomalies(groupId));
  } catch (err) {
    writeLog("Error in detectTaskAnomalies: " + err.toString(), "WARN");
  }
  
  if (anomalies.length === 0) {
    return "✅ Không phát hiện bất thường nào trong nhóm \"" + groupName + "\" hôm nay.";
  }
  
  var listStr = "";
  for (var i = 0; i < anomalies.length; i++) {
    listStr += (i + 1) + ". " + anomalies[i] + "\n";
  }
  
  var suggestion = buildAutoManagementInsight(groupId, anomalies);
  
  var rep = "🚨 CẢNH BÁO BẤT THƯỜNG - Nhóm: " + groupName + "\n\n" +
            listStr + "\n" +
            "📌 Gợi ý xử lý:\n" +
            suggestion;
            
  return rep;
}

function buildAutoManagementInsight(groupId, anomalies) {
  var hasOverdue = false;
  var hasNoResponse = false;
  var hasSilence = false;
  var hasLowerInteraction = false;
  
  anomalies.forEach(function(anomaly) {
    var text = anomaly.toLowerCase();
    if (text.indexOf("quá hạn") !== -1 || text.indexOf("nhắc") !== -1) {
      hasOverdue = true;
    }
    if (text.indexOf("không phản hồi") !== -1 || text.indexOf("không có tương tác phản hồi") !== -1) {
      hasNoResponse = true;
    }
    if (text.indexOf("im lặng") !== -1) {
      hasSilence = true;
    }
    if (text.indexOf("giảm tương tác") !== -1) {
      hasLowerInteraction = true;
    }
  });
  
  var insights = [];
  if (hasOverdue) {
    insights.push("QL/TC nên kiểm tra lại việc tồn và nhắc nhóm cập nhật tiến độ trước 20:30.");
  }
  if (hasNoResponse) {
    insights.push("Nên nhắn tin trực tiếp để kiểm tra tình hình hoặc hỗ trợ nhân sự đang được giao việc.");
  }
  if (hasSilence || hasLowerInteraction) {
    insights.push("Nhóm trưởng nên gửi khảo sát hoặc chủ động chia sẻ công việc/tin nhắn thảo luận để khơi dậy tương tác.");
  }
  
  if (insights.length === 0) {
    return "QL/TC kiểm tra tình hình hoạt động chung của nhóm.";
  }
  
  return insights.join("\n");
}

function shouldSendAnomalyAlert(groupId) {
  var ss = getSpreadsheet();
  var settingsSheet = ss.getSheetByName("Group_Settings");
  var settingsValues = settingsSheet ? settingsSheet.getDataRange().getValues() : [];
  if (!settingsSheet || settingsValues.length === 0) return false;
  
  var headersSettings = settingsValues[0].map(function(h) { return String(h).trim(); });
  var colGId = headersSettings.indexOf("Group ID");
  var colEnable = headersSettings.indexOf("Bật cảnh báo bất thường");
  var colLastAlert = headersSettings.indexOf("Lần cảnh báo bất thường cuối");
  
  if (colGId === -1 || colEnable === -1 || colLastAlert === -1) return false;
  
  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  for (var i = 1; i < settingsValues.length; i++) {
    if (String(settingsValues[i][colGId]).trim() === groupId) {
      var enableVal = String(settingsValues[i][colEnable]).trim();
      var isEnabled = (enableVal === "Bật" || enableVal === "Có" || enableVal === "Yes");
      
      var lastAlertVal = String(settingsValues[i][colLastAlert]).trim();
      
      if (isEnabled && lastAlertVal !== todayStr) {
        return true;
      }
      break;
    }
  }
  return false;
}

function markAnomalyAlertSent(groupId) {
  var ss = getSpreadsheet();
  var settingsSheet = ss.getSheetByName("Group_Settings");
  if (!settingsSheet) return;
  var settingsValues = settingsSheet.getDataRange().getValues();
  if (settingsValues.length === 0) return;
  
  var headersSettings = settingsValues[0].map(function(h) { return String(h).trim(); });
  var colGId = headersSettings.indexOf("Group ID");
  var colLastAlert = headersSettings.indexOf("Lần cảnh báo bất thường cuối");
  
  if (colGId === -1 || colLastAlert === -1) return;
  
  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  for (var i = 1; i < settingsValues.length; i++) {
    if (String(settingsValues[i][colGId]).trim() === groupId) {
      settingsSheet.getRange(i + 1, colLastAlert + 1).setValue(todayStr);
      break;
    }
  }
}

function checkAndSendAnomalyAlerts() {
  var ss = getSpreadsheet();
  var settingsSheet = ss.getSheetByName("Group_Settings");
  if (!settingsSheet) return;
  var settingsValues = settingsSheet.getDataRange().getValues();
  if (settingsValues.length <= 1) return;
  
  var headersSettings = settingsValues[0].map(function(h) { return String(h).trim(); });
  var colGId = headersSettings.indexOf("Group ID");
  var colEnable = headersSettings.indexOf("Bật cảnh báo bất thường");
  
  if (colGId === -1 || colEnable === -1) return;
  
  for (var i = 1; i < settingsValues.length; i++) {
    var groupId = String(settingsValues[i][colGId]).trim();
    if (!groupId) continue;
    
    var enableVal = String(settingsValues[i][colEnable]).trim();
    var isEnabled = (enableVal === "Bật" || enableVal === "Có" || enableVal === "Yes");
    
    if (isEnabled && shouldSendAnomalyAlert(groupId)) {
      var report = buildAnomalyReport(groupId);
      if (report.indexOf("Không phát hiện bất thường") === -1) {
        var admins = getAdminUserIds();
        admins.forEach(function(adminId) {
          sendLinePush_Simple(adminId, report);
        });
        markAnomalyAlertSent(groupId);
        writeLog("Sent auto anomaly alert for group " + groupId + " to admins", "INFO");
      }
    }
  }
}

function getAdminUserIds() {
  var adminProp = "";
  try {
    adminProp = PropertiesService.getScriptProperties().getProperty("ADMIN_USER_IDS") || getSetting("ADMIN_USER_IDS", "");
  } catch (e) {}
  var adminList = [];
  if (adminProp) {
    adminList = adminProp.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
  }
  var defaultAdmins = ["U40778c187ce6a4e3ff38f5f00e998799", "Ue6adbc54620f4c9c22e4c2755e09f5ff"];
  defaultAdmins.forEach(function(uId) {
    if (adminList.indexOf(uId) === -1) {
      adminList.push(uId);
    }
  });
  return adminList;
}

function cleanOldLogsAndInteractions() {
  try {
    var ss = getSpreadsheet();
    
    // 1. Dọn dẹp sheet Interaction_Logs
    var intSheet = ss.getSheetByName("Interaction_Logs");
    if (intSheet) {
      var lastRow = intSheet.getLastRow();
      var maxIntLogs = 10000;
      if (lastRow > maxIntLogs + 500) {
        var keepRange = intSheet.getRange(lastRow - maxIntLogs + 1, 1, maxIntLogs, 13);
        var keepValues = keepRange.getValues();
        intSheet.getRange(2, 1, lastRow - 1, 13).clearContent();
        intSheet.getRange(2, 1, maxIntLogs, 13).setValues(keepValues);
        
        var currentMax = intSheet.getMaxRows();
        if (currentMax > maxIntLogs + 100) {
          intSheet.deleteRows(maxIntLogs + 2, currentMax - (maxIntLogs + 1));
        }
        writeLog("Đã dọn dẹp Interaction_Logs bằng cách ghi đè tối ưu (giữ " + maxIntLogs + " dòng)", "INFO");
      }
    }
    
    // 2. Dọn dẹp sheet Logs
    var logSheet = ss.getSheetByName("Logs");
    if (logSheet) {
      var lastRow = logSheet.getLastRow();
      var maxLogs = 2000;
      if (lastRow > maxLogs + 200) {
        var keepRange = logSheet.getRange(lastRow - maxLogs + 1, 1, maxLogs, 5);
        var keepValues = keepRange.getValues();
        logSheet.getRange(2, 1, lastRow - 1, 5).clearContent();
        logSheet.getRange(2, 1, maxLogs, 5).setValues(keepValues);
        
        var currentMax = logSheet.getMaxRows();
        if (currentMax > maxLogs + 100) {
          logSheet.deleteRows(maxLogs + 2, currentMax - (maxLogs + 1));
        }
        writeLog("Đã dọn dẹp Logs bằng cách ghi đè tối ưu (giữ " + maxLogs + " dòng)", "INFO");
      }
    }
  } catch (err) {
    Logger.log("Lỗi dọn dẹp logs định kỳ: " + err.toString());
  }
}
