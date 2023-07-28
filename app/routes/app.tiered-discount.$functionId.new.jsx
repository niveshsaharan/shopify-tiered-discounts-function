import { useEffect, useMemo } from "react";
import { json } from "@remix-run/node";
import {useForm, useField, useDynamicList} from "@shopify/react-form";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";
import { CurrencyCode } from "@shopify/react-i18n";
import {
  Form,
  useActionData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  ActiveDatesCard,
  CombinationCard,
  DiscountClass,
  DiscountMethod,
  MethodCard,
  DiscountStatus,
  RequirementType,
  SummaryCard,
  UsageLimitsCard,
  onBreadcrumbAction,
} from "@shopify/discount-app-components";
import {
  Banner,
  Card,
  Text,
  Layout,
  Page,
  PageActions,
  TextField,
  VerticalStack, HorizontalStack, Button,
} from "@shopify/polaris";

import shopify from "../shopify.server";
import {DeleteMinor} from "@shopify/polaris-icons";

// This is a server-side action that is invoked when the form is submitted.
// It makes an admin GraphQL request to create a discount.
export const action = async ({ params, request }) => {
  const { functionId } = params;
  const { admin } = await shopify.authenticate.admin(request);
  const formData = await request.formData();
  const {
    title,
    combinesWith,
    startsAt,
    endsAt,
    configuration,
  } = JSON.parse(formData.get("discount"));

  const baseDiscount = {
    functionId,
    title,
    combinesWith,
    startsAt: new Date(startsAt),
    endsAt: endsAt && new Date(endsAt),
  };

    const response = await admin.graphql(
        `#graphql
      mutation CreateAutomaticDiscount($discount: DiscountAutomaticAppInput!) {
        discountCreate: discountAutomaticAppCreate(automaticAppDiscount: $discount) {
          userErrors {
            code
            message
            field
          }
        }
      }`,
      {
        variables: {
          discount: {
            ...baseDiscount,
            metafields: [
              {
                namespace: "$app:tiered-discount",
                key: "function-configuration",
                type: "json",
                value: JSON.stringify({
                  tiers: configuration.tiers,
                  type: configuration.type,
                  message: configuration.message,
                  next_message: configuration.next_message,
                }),
              },
            ],
          },
        },
      }
    );

    const responseJson = await response.json();
    const errors = responseJson.data.discountCreate?.userErrors;
    return json({ errors });
};

// This is the React component for the page.
export default function CreateDiscount() {
  const submitForm = useSubmit();
  const actionData = useActionData();
  const navigation = useNavigation();
  const app = useAppBridge();
  const todaysDate = useMemo(() => new Date(), []);

  const isLoading = navigation.state === "submitting";
  const currencyCode = CurrencyCode.Cad;
  const submitErrors = actionData?.errors || [];
  const redirect = Redirect.create(app);

  useEffect(() => {
    if (actionData?.errors.length === 0) {
      redirect.dispatch(Redirect.Action.ADMIN_SECTION, {
        name: Redirect.ResourceType.Discount,
      });
    }
  }, [actionData, redirect]);

  const emptyTierFactory = ({from, to, discount}) => {
    return [
      {from: from || 0, to: to || -1, discount: discount || 1},
    ];
  };


  const tiers = useDynamicList([{from: 0, to: -1, discount: 1}], emptyTierFactory);

  const {
    fields: {
      discountTitle,
      discountCode,
      discountMethod,
      combinesWith,
      requirementType,
      requirementSubtotal,
      requirementQuantity,
      usageLimit,
      appliesOncePerCustomer,
      startDate,
      endDate,
      dynamicLists,
      configuration,
    },
    submit,
    submitErrors: submitErrors1,
    // @ts-ignore
  } = useForm({
    fields: {
      discountTitle: useField(""),
      discountMethod: useField(DiscountMethod.Automatic),
      discountCode: useField(""),
      combinesWith: useField({
        orderDiscounts: false,
        productDiscounts: false,
        shippingDiscounts: false,
      }),
      requirementType: useField(RequirementType.None),
      requirementSubtotal: useField("0"),
      requirementQuantity: useField("0"),
      usageLimit: useField(null),
      appliesOncePerCustomer: useField(false),
      startDate: useField(todaysDate),
      endDate: useField(null),
      dynamicLists: {
        tiers,
      },
      configuration: {
        tiers: useField([
          {from: useField(0), to: useField(0), discount: useField(0)},
        ]),
        type: useField('tiered'),
        message: useField('Congratulations! You get {{percentage}} % off your order!'),
        next_message: useField(`Spend {{remaining}} more and get {{percentage}} % off.`),
      },
    },
    onSubmit: async (form) => {
      const discount = {
        title: form.discountTitle,
        method: form.discountMethod,
        code: form.discountCode,
        combinesWith: form.combinesWith,
        usageLimit: form.usageLimit == null ? null : parseInt(form.usageLimit),
        appliesOncePerCustomer: form.appliesOncePerCustomer,
        startsAt: form.startDate,
        endsAt: form.endDate,
        configuration: {
          tiers: form.dynamicLists.tiers.value,
          type: form.configuration.type,
          message: form.configuration.message,
          next_message: form.configuration.next_message,
        },
      };

      if(! validateTiers()){
        return {status: 'fail', errors: [{message: 'Tiers are invalid.'}]};
      }

      submitForm({ discount: JSON.stringify(discount) }, { method: "post" });

      return { status: "success" };
    },
  });

  const validateTiers = (adding = false) => {
    // Check if there is no tier that includes unlimited
    let unlimitedTierIndex = null;
    let hasFromMoreThanTo = false
    let hasZeroUpto = false
    dynamicLists.tiers.value.forEach((tier, i) => {
      if(parseFloat(tier.to) === -1){
        unlimitedTierIndex = i;
      }

      if(parseFloat(tier.to) !== -1 && parseFloat(tier.to) <= parseFloat(tier.from)){
        hasFromMoreThanTo = true;
      }

      if(parseFloat(tier.to) === 0){
        hasZeroUpto = true;
      }
    });

    if(unlimitedTierIndex != null && adding){
      alert("There is a tier that includes unlimited for cart total upto.")
      return;
    }

    if(hasZeroUpto){
      alert("The cart total upto cannot be zero.")
      return;
    }
    if(hasFromMoreThanTo){
      alert("The cart total from cannot be less than cart total upto.")
      return;
    }

    return true;
  }

  const addNewTier = () => {
    const previousValue = dynamicLists.tiers.value[dynamicLists.tiers.fields.length - 1]
    let from = 0
    if(typeof previousValue !== "undefined" && previousValue.to > 0){
      from = parseFloat(previousValue.to) + 0.01
    }

     if(validateTiers(true)){
       dynamicLists.tiers.addItem({from, to: -1, discount: 1})
     }
  }

  let errorBanner =
    submitErrors.length > 0 ? (
      <Layout.Section>
        <Banner status="critical">
          <p>There were some issues with your form submission:</p>
          <ul>
            {submitErrors.map(({ message, field }, index) => {
              return (
                <li key={`${message}${index}`}>
                  {field.join(".")} {message}
                </li>
              );
            })}
          </ul>
        </Banner>
      </Layout.Section>
    ) : null;

  if(! errorBanner){
    errorBanner =
      submitErrors1.length > 0 ? (
        <Layout.Section>
          <Banner status="critical">
            <p>There were some issues with your form submission:</p>
            <ul>
              {submitErrors1.map(({message}, index) => {
                return <li key={`${message}${index}`}>{message}</li>;
              })}
            </ul>
          </Banner>
        </Layout.Section>
      ) : null;
  }

  return (
    // Render a discount form using Polaris components and the discount app components
    <Page
      title="Create tiered discount"
      backAction={{
        content: "Discounts",
        onAction: () => onBreadcrumbAction(redirect, true),
      }}
      primaryAction={{
        content: "Save",
        onAction: submit,
        loading: isLoading,
      }}
    >
      <Layout>
        {errorBanner}
        <Layout.Section>
          <Form method="post">
            <VerticalStack align="space-around" gap="2">
              <MethodCard
                title="Tiered discounts"
                discountTitle={discountTitle}
                discountClass={DiscountClass.Product}
                discountCode={discountCode}
                discountMethod={discountMethod}
                discountMethodHidden
              />
              { /* Collect data for the configuration metafield. */ }
              <Card>

                <VerticalStack gap="3">
                  <Text variant="headingMd" as="h2">
                    Tiers
                  </Text>
                  {dynamicLists.tiers.fields.map((tier, i) => {
                    return <HorizontalStack key={i} blockAlign={`center`}   align={"space-between"} gap={"1"}>
                      <TextField
                        type={"number"}
                        min={0}
                        step={1}
                        largeStep={100}
                        label="Cart total from"
                        inputMode={'decimal'}
                        requiredIndicator
                        value={tier.from.value}
                        onChange={tier.from.onChange}
                      />
                      <TextField
                        type={"number"}
                        min={-1}
                        step={1}
                        largeStep={100}
                        label="Cart total upto"
                        inputMode={'decimal'}
                        requiredIndicator
                        value={tier.to.value}
                        onChange={tier.to.onChange}
                      />
                      <TextField
                        type={"number"}
                        min={1}
                        max={100}
                        step={1}
                        largeStep={10}
                        label="Discount"
                        inputMode={'decimal'}
                        requiredIndicator
                        suffix={'%'}
                        value={tier.discount.value}
                        onChange={tier.discount.onChange}
                      />

                      <div className="">
                        <div className="Polaris-Labelled__LabelWrapper">
                          <div className="Polaris-Label"><label className="Polaris-Label__Text">&nbsp;</label></div>
                        </div>
                        <Button icon={DeleteMinor} destructive plain onClick={() => dynamicLists.tiers.removeItem(i)} disabled={dynamicLists.tiers.fields.length === 1} />

                      </div>
                    </HorizontalStack>

                  })}

                  <HorizontalStack align={"end"}><Button onClick={addNewTier}>+ Add another tier</Button></HorizontalStack>
                </VerticalStack>

              </Card>

              <Card>

                <VerticalStack gap="3">
                  <Text variant="headingMd" as="h2">
                    Messages
                  </Text>

                  <TextField
                    label="Discount message when a tier is qualified"
                    autoComplete="on"
                    helpText={`Available shortcodes: {{percentage}}`}
                    {...configuration.message}
                  />

                  <TextField
                    label="Encouragement message to qualify for the next tier"
                    autoComplete="on"
                    helpText={`Available shortcodes: {{percentage}}, {{remaining}}`}
                    {...configuration.next_message}
                  />

                </VerticalStack>
              </Card>


              {discountMethod.value === DiscountMethod.Code && (
                <UsageLimitsCard
                  totalUsageLimit={usageLimit}
                  oncePerCustomer={appliesOncePerCustomer}
                />
              )}
              <CombinationCard
                combinableDiscountTypes={combinesWith}
                discountClass={DiscountClass.Product}
                discountDescriptor={"Discount"}
              />
              <ActiveDatesCard
                startDate={startDate}
                endDate={endDate}
                timezoneAbbreviation="EST"
              />
            </VerticalStack>
          </Form>
        </Layout.Section>
        <Layout.Section secondary>
          <SummaryCard
            header={{
              discountMethod: discountMethod.value,
              discountDescriptor:
                discountMethod.value === DiscountMethod.Automatic
                  ? discountTitle.value
                  : discountCode.value,
              appDiscountType: "Tiered Discount",
              isEditing: false,
            }}
            performance={{
              status: DiscountStatus.Scheduled,
              usageCount: 0,
              isEditing: false,
            }}
            minimumRequirements={{
              requirementType: requirementType.value,
              subtotal: requirementSubtotal.value,
              quantity: requirementQuantity.value,
              currencyCode: currencyCode,
            }}
            usageLimits={{
              oncePerCustomer: appliesOncePerCustomer.value,
              totalUsageLimit: usageLimit.value,
            }}
            activeDates={{
              startDate: startDate.value,
              endDate: endDate.value,
            }}
          />
        </Layout.Section>
        <Layout.Section>
          <PageActions
            primaryAction={{
              content: "Save discount",
              onAction: submit,
              loading: isLoading,
            }}
            secondaryActions={[
              {
                content: "Discard",
                onAction: () => onBreadcrumbAction(redirect, true),
              },
            ]}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
