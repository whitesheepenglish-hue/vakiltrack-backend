const { scrapeCaseDetails } = require('../services/ecourtScraper');

/**
 * @desc    Search case details from eCourts
 * @route   POST /api/cases/search
 * @access  Private
 */
const searchCase = async (req, res, next) => {
    try {
        const { district, courtComplex, caseType, caseNumber, caseYear } = req.body;

        // Basic validation
        if (!district || !courtComplex || !caseType || !caseNumber || !caseYear) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all search fields: district, courtComplex, caseType, caseNumber, caseYear'
            });
        }

        // Validate year format
        if (!/^\d{4}$/.test(caseYear)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid case year format'
            });
        }

        const caseData = await scrapeCaseDetails(district, courtComplex, caseType, caseNumber, caseYear);

        if (!caseData || !caseData.petitionerName) {
            return res.status(404).json({
                success: false,
                message: 'Case not found'
            });
        }

        res.status(200).json({
            success: true,
            data: caseData
        });

    } catch (error) {
        // Log the internal error but don't expose scraper details to client
        next(error);
    }
};

module.exports = {
    searchCase
};
