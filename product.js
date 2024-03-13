function main() {
  var currentDate = new Date();
  var pastDate = new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), currentDate.getDate());
  var toDate = Utilities.formatDate(currentDate, 'GMT', 'yyyyMMdd');
  var fromDate = Utilities.formatDate(pastDate, 'GMT', 'yyyyMMdd');

  Logger.log("Script execution started for the period: " + fromDate + " to " + toDate);

  try {
    var shoppingCampaigns = AdsApp.shoppingCampaigns().withCondition("Status = ENABLED").get();
    Logger.log("Processing enabled shopping campaigns...");
    while (shoppingCampaigns.hasNext()) {
      var campaign = shoppingCampaigns.next();
      processAdGroups(campaign.adGroups(), "Shopping", campaign.getName(), fromDate, toDate);
    }
    Logger.log("Finished processing all shopping campaigns.");
  } catch (e) {
    Logger.log("Error: " + e.toString());
  }
}

function processAdGroups(adGroupIterator, campaignTypeName, campaignName, fromDate, toDate) {
  adGroupIterator = adGroupIterator.withCondition("Status = ENABLED").get();
  while (adGroupIterator.hasNext()) {
    var adGroup = adGroupIterator.next();
    var reportType = campaignTypeName === "Shopping" ? "SHOPPING_PERFORMANCE_REPORT" : "SEARCH_QUERY_PERFORMANCE_REPORT";
    var totalConversionsReport = AdsApp.report(
      "SELECT Conversions " +
      "FROM " + reportType + " " +
      "WHERE AdGroupId = " + adGroup.getId() + " " +
      "DURING " + fromDate + "," + toDate
    );

    var totalConversions = 0;
    var rows = totalConversionsReport.rows();
    while (rows.hasNext()) {
      var row = rows.next();
      totalConversions += parseInt(row['Conversions']);
    }

    if (totalConversions > 20) {
      processConversions(adGroup, campaignTypeName, fromDate, toDate, campaignName);
    }
  }
}

function processConversions(adGroup, campaignTypeName, fromDate, toDate, campaignName) {
  var report;
  if (campaignTypeName === "Shopping") {
    report = AdsApp.report("SELECT OfferId, Cost, Conversions, Clicks " +
      "FROM SHOPPING_PERFORMANCE_REPORT " +
      "WHERE AdGroupId = " + adGroup.getId() + " " +
      "AND Conversions > 0 " +
      "DURING " + fromDate + "," + toDate);
  } else {
    report = AdsApp.report("SELECT Query, Cost, Conversions, Clicks " +
      "FROM SEARCH_QUERY_PERFORMANCE_REPORT " +
      "WHERE AdGroupId = " + adGroup.getId() + " " +
      "AND Conversions > 0 " +
      "DURING " + fromDate + "," + toDate);
  }

  var totalSpendForConvertingItems = 0;
  var totalConversions = 0;
  var totalClicksForConvertingItems = 0;
  var rows = report.rows();
  while (rows.hasNext()) {
    var row = rows.next();
    totalSpendForConvertingItems += parseFloat(row['Cost'].replace(/,/g, ''));
    totalConversions += parseInt(row['Conversions']);
    totalClicksForConvertingItems += parseInt(row['Clicks']);
  }

  Logger.log("Ad Group: " + adGroup.getName() + ", Total Conversions: " + totalConversions);

  if (totalConversions > 0) {
    var itemsToHighlight = evaluateItemsToHighlight(adGroup, totalSpendForConvertingItems, totalConversions, totalClicksForConvertingItems, fromDate, toDate, campaignName);
    logHighlightedItems(campaignName, adGroup, itemsToHighlight);
  }
}

function evaluateItemsToHighlight(adGroup, totalSpend, totalConversions, totalClicks, fromDate, toDate, campaignName) {
  var averageCostPerConversion = totalSpend / totalConversions;
  var averageClicksPerConversion = totalClicks / totalConversions;

  Logger.log("Campaign: " + campaignName + ", Ad Group: " + adGroup.getName() + ", Average Cost Per Conversion: " + averageCostPerConversion.toFixed(2));
  Logger.log("Campaign: " + campaignName + ", Ad Group: " + adGroup.getName() + ", Average Clicks Per Conversion: " + averageClicksPerConversion.toFixed(2));

  var itemsToHighlight = [];

  var report = AdsApp.report("SELECT OfferId, Cost, Conversions, Clicks " +
    "FROM SHOPPING_PERFORMANCE_REPORT " +
    "WHERE AdGroupId = " + adGroup.getId() + " " +
    "AND Conversions = 0 " +
    "DURING " + fromDate + "," + toDate);

  var rows = report.rows();
  while (rows.hasNext()) {
    var row = rows.next();
    var cost = parseFloat(row['Cost'].replace(/,/g, ''));
    var clicks = parseInt(row['Clicks']);
    if (cost > averageCostPerConversion || clicks > averageClicksPerConversion) {
      itemsToHighlight.push(row['OfferId']);
    }
  }

  return itemsToHighlight.filter(function(itemId) {
    return !getExcludedItemIds(adGroup).includes(itemId);
  });
}

function logHighlightedItems(campaignName, adGroup, itemsToHighlight) {
  if (itemsToHighlight.length > 0) {
    var itemsString = itemsToHighlight.join(", ");
    Logger.log("Campaign: " + campaignName + ", Ad Group: " + adGroup.getName() + ", Items to potentially exclude: " + itemsString);
  } else {
    Logger.log("Campaign: " + campaignName + ", Ad Group: " + adGroup.getName() + ", No items to exclude based on the criteria.");
  }
}

function getExcludedItemIds(adGroup) {
  var excludedItemIds = [];
  var productGroups = adGroup.productGroups().get();
  while (productGroups.hasNext()) {
    var productGroup = productGroups.next();
    if (productGroup.isExcluded()) {
      var productGroupString = productGroup.getValue();
      var itemIdMatch = productGroupString.match(/.*\bid=(\d+).*$/);
      if (itemIdMatch && itemIdMatch.length > 1) {
        excludedItemIds.push(itemIdMatch[1]);
      }
    }
  }
  return excludedItemIds;
}
