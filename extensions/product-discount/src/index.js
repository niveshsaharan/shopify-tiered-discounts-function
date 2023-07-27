// @ts-check
import {DiscountApplicationStrategy} from "../generated/api";

/**
 * @typedef {import("../generated/api").InputQuery} InputQuery
 * @typedef {import("../generated/api").FunctionResult} FunctionResult
 * @typedef {import("../generated/api").Target} Target
 * @typedef {import("../generated/api").ProductVariant} ProductVariant
 */

/**
 * @type {FunctionResult}
 */
const EMPTY_DISCOUNT = {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [],
};



export default /**
 * @param {InputQuery} input
 * @returns {FunctionResult}
 */
    (input) => {
    // Define a type for your configuration, and parse it from the metafield
    /**
     * @type {{
     *  tiers: Array
     *  type: String
     * }}
     */
    const configuration = JSON.parse(
        input?.discountNode?.metafield?.value ?? JSON.stringify({tiers: [], type: "tiers"})
    );

  function string_replacer(string, replaces){
    Object.keys(replaces).forEach(key => {
      string = string.replaceAll(`{{${key}}}`, replaces[key]);
    })

    return string;
  }

    if (configuration.type === 'tiered' && configuration.tiers && Array.isArray(configuration.tiers) && configuration.tiers.length > 0) {
        const tiers = configuration.tiers.sort((a,b) => a.from - b.from); // b - a for reverse sort
        let cartTotal = 0;
        let percentage = 0;
        let messages = [];

        const targets = input.cart.lines
            // Use the configured quantity instead of a hardcoded value
            .filter(line => line.merchandise.__typename === "ProductVariant" && line.merchandise.product.hasAnyTag)
            .map(line => {
                cartTotal += parseFloat(line.cost.totalAmount.amount)
                const variant = /** @type {ProductVariant} */ (line.merchandise);
                return /** @type {Target} */ ({
                    productVariant: {
                        id: variant.id
                    }
                });
            });

        let eligibleTierIndex = null;
        const eligibleTier = tiers.find((tier, i) => {
            const valid = tier.from <= cartTotal && (tier.to >= cartTotal || tier.to === -1)

            if(valid){
                eligibleTierIndex = i;
            }

            return valid;
        });

        const nextEligibleTier = eligibleTierIndex + 1 < tiers.length ? tiers[eligibleTierIndex + 1] : null;

        if (eligibleTier && targets.length) {
            percentage = eligibleTier.discount;

            if (percentage > 0) {

                messages.push(string_replacer(configuration.message || `Congratulations! You get {{percentage}} % off your order!`, {
                  percentage
                }));

                if(nextEligibleTier){
                  if(configuration.next_message) {
                    const nextPercentage = nextEligibleTier.discount.toString()
                    const remaining = parseFloat(parseFloat(nextEligibleTier.from - cartTotal).toFixed(2)).toString()
                    messages.push(string_replacer(configuration.next_message, {
                      percentage: nextPercentage,
                      remaining: remaining
                    }));
                  }
                }

                return {
                    discounts: [
                        {
                            targets,
                            value: {
                                percentage: {
                                    // Use the configured percentage instead of a hardcoded value
                                    value: percentage.toString()
                                }
                            },
                            message: messages.join(' ')
                        }
                    ],
                    discountApplicationStrategy: DiscountApplicationStrategy.Maximum
                };
            }
        }
    }

    console.error(JSON.stringify(input))
    return EMPTY_DISCOUNT;
};
