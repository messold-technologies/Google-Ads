function main()
{
    var currentDate = new Date();
    var pastDate = new Date();
    pastDate.setDate(currentDate.getDate() - 365);
    var toDate = Utilities.formatDate(currentDate, 'GMT', 'yyyyMMdd');
    var fromDate = Utilities.formatDate(pastDate, 'GMT', 'yyyyMMdd');
    try
    {
        var regularCampaigns = AdsApp.campaigns().withCondition("Status = ENABLED").get();
        while (regularCampaigns.hasNext())
        {
            var campaign = regularCampaigns.next();
            processAdGroups(campaign.adGroups(), "Regular", campaign.getName(), fromDate, toDate);
        }
        var shoppingCampaigns = AdsApp.shoppingCampaigns().withCondition("Status = ENABLED").get();
        while (shoppingCampaigns.hasNext())
        {
            var campaign = shoppingCampaigns.next();
            processAdGroups(campaign.adGroups(), "Shopping", campaign.getName(), fromDate, toDate);
        }
    }
    catch (e)
    {
        Logger.log("Error: " + e.toString());
    }
}

function processAdGroups(adGroupIterator, campaignTypeName, campaignName, fromDate, toDate)
{
    adGroupIterator = adGroupIterator.withCondition("Status = ENABLED").get();
    while (adGroupIterator.hasNext())
    {
        var adGroup = adGroupIterator.next();
        var totalConversionsReport = AdsApp.report("SELECT Conversions " + "FROM ADGROUP_PERFORMANCE_REPORT " + "WHERE AdGroupId = " + adGroup.getId() + " " + "DURING " + fromDate + "," + toDate);
        var totalConversions = 0;
        var rows = totalConversionsReport.rows();
        while (rows.hasNext())
        {
            var row = rows.next();
            totalConversions += parseInt(row['Conversions']);
        }
        if (totalConversions > 20)
        {
            var report = AdsApp.report("SELECT Query, Cost, Conversions, Clicks " + "FROM SEARCH_QUERY_PERFORMANCE_REPORT " + "WHERE AdGroupId = " + adGroup.getId() + " " + "AND Conversions > 0 " + "DURING " + fromDate + "," + toDate);
            var rows = report.rows();
            var totalSpendForConvertingSearchTerms = 0;
            var totalConversions = 0;
            var totalClicksForConvertingSearchTerms = 0;
            while (rows.hasNext())
            {
                var row = rows.next();
                totalSpendForConvertingSearchTerms += parseFloat(row['Cost'].replace(/,/g, ''));
                totalConversions += parseInt(row['Conversions']);
                totalClicksForConvertingSearchTerms += parseInt(row['Clicks']);
            }
            var searchTermsToNegate = [];
            var averageCostPerConversion = totalSpendForConvertingSearchTerms / totalConversions;
            var averageClicksPerConversion = totalClicksForConvertingSearchTerms / totalConversions;

            Logger.log("Average Cost Per Conversion: " + averageCostPerConversion);
            Logger.log("Average Clicks Per Conversion: " + averageClicksPerConversion);

            report = AdsApp.report("SELECT Query, Cost, Conversions, ConversionValue, Clicks " + "FROM SEARCH_QUERY_PERFORMANCE_REPORT " + "WHERE AdGroupId = " + adGroup.getId() + " " + "DURING " + fromDate + "," + toDate);
            rows = report.rows();
            while (rows.hasNext())
            {
                var row = rows.next();
                var cost = parseFloat(row['Cost'].replace(/,/g, '')); // Remove commas before parsing
                var conversions = parseFloat(row['Conversions'].replace(/,/g, '')); // Remove commas
                var conversionValue = parseFloat(row['ConversionValue'].replace(/,/g, '')); // Remove commas
                var clicks = parseInt(row['Clicks'].replace(/,/g, '')); // Remove commas
                var roas = conversionValue > 0 ? conversionValue / cost : 0;
                if (conversions == 0 && (cost > averageCostPerConversion || clicks > averageClicksPerConversion))
                {
                    if (!isNegativeKeyword(adGroup, row['Query']))
                    {
                       Logger.log("Term: " + row['Query'] + ", Cost: " + cost + ", Clicks: " + clicks + ", Conversions: " + conversions + ", Conversion Value: " + conversionValue + ", ROAS: " + roas);
                        searchTermsToNegate.push(row['Query']);
                    }
                }
                else if (roas < 1 && (cost > 1.5 * averageCostPerConversion || clicks > 1.5 * averageClicksPerConversion))
                {
                    if (!isNegativeKeyword(adGroup, row['Query']))
                    {
                        Logger.log("Term: " + row['Query'] + ", Cost: " + cost + ", Clicks: " + clicks + ", Conversions: " + conversions + ", Conversion Value: " + conversionValue + ", ROAS: " + roas);
                        searchTermsToNegate.push(row['Query']);
                    }
                }
            }
            if (searchTermsToNegate.length > 0)
            {
                var keywordsString = searchTermsToNegate.map(function(keyword)
                {
                    return "[" + keyword + "]";
                }).join("\n");
                Logger.log(new Date().toLocaleString() + "\tCampaign: " + campaignName + "\nAd Group: " + adGroup.getName() + "\n" + keywordsString);
            }
        }
    }

    function isNegativeKeyword(adGroup, term)
    {
        var negativeKeywords = adGroup.negativeKeywords().get();
        while (negativeKeywords.hasNext())
        {
            var negativeKeyword = negativeKeywords.next();
            if (negativeKeyword.getText() === term)
            {
                return true;
            }
        }
        return false;
    }
}
