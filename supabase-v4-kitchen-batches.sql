ALTER TABLE public.table_orders
  ADD COLUMN IF NOT EXISTS kitchen_batches jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS kitchen_batches jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.claim_table_kitchen_batch(p_table_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_order public.table_orders%ROWTYPE;
  v_batches jsonb;
  v_lines jsonb;
  v_batch_no integer;
  v_batch jsonb;
BEGIN
  SELECT *
    INTO v_order
    FROM public.table_orders
    WHERE table_id = p_table_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table order not found';
  END IF;

  v_batches := COALESCE(v_order.kitchen_batches, '[]'::jsonb);

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_batches) AS batch(value)
      WHERE batch.value->>'status' = 'printing'
        AND (batch.value->>'reserved_at')::timestamptz > now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'A kitchen batch is already being printed for this table';
  END IF;

  WITH current_lines AS (
    SELECT
      COALESCE(
        item.value->>'kitchen_line_id',
        'legacy:' || jsonb_build_array(
          COALESCE(item.value->>'name', ''),
          COALESCE((item.value->>'price')::numeric, 0)
        )::text
      ) AS kitchen_line_id,
      COALESCE(item.value->>'name', '') AS name,
      COALESCE((item.value->>'price')::numeric, 0) AS price,
      SUM(COALESCE((item.value->>'qty')::numeric, 0)) AS qty
    FROM jsonb_array_elements(COALESCE(v_order.lines, '[]'::jsonb)) AS item(value)
    GROUP BY
      COALESCE(
        item.value->>'kitchen_line_id',
        'legacy:' || jsonb_build_array(
          COALESCE(item.value->>'name', ''),
          COALESCE((item.value->>'price')::numeric, 0)
        )::text
      ),
      COALESCE(item.value->>'name', ''),
      COALESCE((item.value->>'price')::numeric, 0)
  ),
  sent_lines AS (
    SELECT
      COALESCE(
        item.value->>'kitchen_line_id',
        'legacy:' || jsonb_build_array(
          COALESCE(item.value->>'name', ''),
          COALESCE((item.value->>'price')::numeric, 0)
        )::text
      ) AS kitchen_line_id,
      SUM(COALESCE((item.value->>'qty')::numeric, 0)) AS qty
    FROM jsonb_array_elements(v_batches) AS batch(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(batch.value->'lines', '[]'::jsonb)) AS item(value)
    WHERE batch.value->>'status' = 'sent'
    GROUP BY
      COALESCE(
        item.value->>'kitchen_line_id',
        'legacy:' || jsonb_build_array(
          COALESCE(item.value->>'name', ''),
          COALESCE((item.value->>'price')::numeric, 0)
        )::text
      )
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('kitchen_line_id', current_lines.kitchen_line_id,
        'name', current_lines.name, 'price', current_lines.price,
        'qty', current_lines.qty - COALESCE(sent_lines.qty, 0))
      ORDER BY current_lines.name
    ),
    '[]'::jsonb
  )
    INTO v_lines
    FROM current_lines
    LEFT JOIN sent_lines USING (kitchen_line_id)
    WHERE current_lines.qty - COALESCE(sent_lines.qty, 0) > 0;

  IF jsonb_array_length(v_lines) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX((batch.value->>'batch_no')::integer), 0) + 1
    INTO v_batch_no
    FROM jsonb_array_elements(v_batches) AS batch(value)
    WHERE batch.value->>'status' = 'sent';

  v_batch := jsonb_build_object(
    'batch_no', v_batch_no,
    'token', gen_random_uuid()::text,
    'status', 'printing',
    'reserved_at', now(),
    'lines', v_lines
  );

  UPDATE public.table_orders
    SET kitchen_batches = v_batches || jsonb_build_array(v_batch),
        updated_at = now()
    WHERE table_id = p_table_id;

  RETURN v_batch;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_table_kitchen_batch(
  p_table_id bigint,
  p_token text,
  p_sent boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_batches jsonb;
  v_updated jsonb;
  v_found boolean;
BEGIN
  SELECT kitchen_batches
    INTO v_batches
    FROM public.table_orders
    WHERE table_id = p_table_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT
    COALESCE(
      jsonb_agg(
        CASE
          WHEN batch.value->>'token' = p_token THEN
            batch.value || jsonb_build_object(
              'status', CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
              'finished_at', now()
            )
          ELSE batch.value
        END
        ORDER BY batch.ordinality
      ),
      '[]'::jsonb
    ),
    COALESCE(bool_or(batch.value->>'token' = p_token), false)
    INTO v_updated, v_found
    FROM jsonb_array_elements(COALESCE(v_batches, '[]'::jsonb))
      WITH ORDINALITY AS batch(value, ordinality);

  IF NOT v_found THEN
    RETURN false;
  END IF;

  UPDATE public.table_orders
    SET kitchen_batches = v_updated,
        updated_at = now()
    WHERE table_id = p_table_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_table_kitchen_batch(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_table_kitchen_batch(bigint, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_table_kitchen_batch(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_table_kitchen_batch(bigint, text, boolean) TO authenticated;
