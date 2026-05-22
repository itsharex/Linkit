import type {
  GalleryDeleteResponse,
  GalleryItem,
  GalleryResponse,
  GalleryTagsResponse,
  CreateShareResponse,
} from "@/types/api";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  addToast,
  Input,
  Alert,
  NumberInput,
  Switch,
  CheckboxGroup,
  Select,
  SelectItem,
} from "@heroui/react";
import clsx from "clsx";

import PreviewCore from "@/components/preview-core";
import GalleryCard from "./gallery-card";

import api, { ApiResponse } from "@/lib/api";
import { inferMediaType } from "@/lib/file";
import { copyText } from "@/lib/utils";
import XModal from "@/components/modal";
import BillCheckbox from "@/components/bill-checkbox";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;
const SHARE_PASSWORD_MIN = 4;
const SHARE_PASSWORD_MAX = 32;
type ShareDurationUnit = "minutes" | "hours" | "days";
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

function buildExpireDateTime(
  duration: number,
  unit: ShareDurationUnit,
): string | null {
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const target = new Date();

  // 根据选择的单位计算过期时间
  if (unit === "minutes") {
    target.setMinutes(target.getMinutes() + duration);
  } else if (unit === "hours") {
    target.setHours(target.getHours() + duration);
  } else if (unit === "days") {
    target.setDate(target.getDate() + duration);
  } else {
    return null;
  }

  const pad = (num: number) => String(num).padStart(2, "0");

  const datetime = [
    target.getFullYear(),
    pad(target.getMonth() + 1),
    pad(target.getDate()),
  ].join("-") +
    ` ${pad(target.getHours())}:${pad(target.getMinutes())}:${pad(target.getSeconds())}`;

  return datetime;
}

function buidlPwd(length: number = 4): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let pwd = "";

  for (let i = 0; i < length; i += 1) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

function deleteGalleryItems(ids: number[]) {
  return Promise.all(
    ids.map((id) =>
      api.post<GalleryDeleteResponse>("/gallery/delete", { id }),
    ),
  );
}

export default function GalleryGrid() {
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagSelected, setTagSelected] = useState<string[]>([]);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [preview, setPreview] = useState<GalleryItem | null>(null);

  const [share, setShare] = useState<GalleryItem | null>(null);
  const [sharePassword, setSharePassword] = useState("");
  const [shareDuration, setShareDuration] = useState<number>(0);
  const [shareExpireTime, setShareExpireTime] = useState<string | null>(null);
  const [shareDurationUnit, setShareDurationUnit] =
    useState<ShareDurationUnit>("days");
  const [shareRelay, setShareRelay] = useState(false);

  const [bathDeleteMode, setBathDeleteMode] = useState(false);
  const [batchDeleteIds, setBatchDeleteIds] = useState<number[]>([]);
  const [deleteConfirmItems, setDeleteConfirmItems] = useState<GalleryItem[]>(
    [],
  );
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareResult, setShareResult] = useState<{
    url: string;
    code: string;
    password: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (share) {
      setSharePassword(buidlPwd(4));
      setShareResult(null);
      setShareDuration(0);
      setShareExpireTime(null);
      setShareRelay(false);
    }
  }, [share]);

  useEffect(() => {
    if (!bathDeleteMode) {
      setBatchDeleteIds([]);
      setDeleteConfirmItems([]);
    }
  }, [bathDeleteMode]);

  const totalPages = useMemo(() => {
    if (total <= 0) return 1;

    return Math.max(1, Math.ceil(total / pageSize));
  }, [pageSize, total]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await api.get<GalleryTagsResponse>("/gallery/tags", {
        hideToast: true,
      });
      setAvailableTags(res.tags);
    } catch (err) {
      console.log(err);
      setAvailableTags([]);
    }
  }, []);

  const fetchData = useCallback(
    async (
      targetPage: number,
      selectedTags: string[] = tagSelected,
      selectedPageSize: PageSize = pageSize,
    ) => {
      const nextPage = Math.max(1, targetPage);
      const params = new URLSearchParams({
        page: String(nextPage),
        size: String(selectedPageSize),
      });
      if (selectedTags.length > 0) {
        params.set("tags", selectedTags.join(","));
      }

      setLoading(true);
      setError(null);
      try {
        const res = await api.get<GalleryResponse>(
          `/gallery?${params.toString()}`,
        );
        const maxPage =
          res.total > 0
            ? Math.max(1, Math.ceil(res.total / selectedPageSize))
            : 1;
        const safePage = Math.min(res.page, maxPage);

        if (safePage !== page) {
          setPage(safePage);
        }
        setItems(res.data);
        setTotal(res.total);
      } catch (err) {
        console.log(err);
        const message = (err as ApiResponse<unknown>).msg;
        setError(message);
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, tagSelected],
  );

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    fetchData(page, tagSelected, pageSize);
  }, [fetchData, page, pageSize, tagSelected]);

  const handleTagChange = useCallback((values: string[]) => {
    setTagSelected(values);
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((key?: string | null) => {
    const nextPageSize = Number(key);

    if (PAGE_SIZE_OPTIONS.includes(nextPageSize as PageSize)) {
      setPageSize(nextPageSize as PageSize);
      setPage(1);
    }
  }, []);

  const handleCopy = useCallback(async (url: string) => {
    if (!url) return;

    const ok = await copyText(url);
    if (ok) {
      addToast({
        title: "已复制链接",
        description: url,
        color: "success",
        variant: "flat",
      });
    } else {
      addToast({
        title: "复制失败",
        description: "请手动复制链接",
        color: "danger",
        variant: "flat",
      });
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    if (deleteConfirmItems.length === 0 || deleteSubmitting) return;

    const deletingItems = deleteConfirmItems;
    const deletingIds = deletingItems.map((item) => item.id);
    const isBatchDelete = deletingItems.length > 1;

    setDeleteSubmitting(true);
    try {
      await deleteGalleryItems(deletingIds);
      addToast({
        title: isBatchDelete ? "批量删除成功" : "删除成功",
        description: isBatchDelete
          ? `已删除 ${deletingItems.length} 个资源`
          : deletingItems[0]?.filename,
        color: "success",
        variant: "flat",
      });
      setDeleteConfirmItems([]);
      setBatchDeleteIds([]);
      if (isBatchDelete) {
        setBathDeleteMode(false);
      }
      if (preview && deletingIds.includes(preview.id)) {
        setPreview(null);
      }
      await fetchData(page);
    } catch (err) {
      console.log(err);
      addToast({
        title: isBatchDelete ? "批量删除失败" : "删除失败",
        description: isBatchDelete
          ? "部分资源可能已删除，请刷新后确认"
          : "请稍后重试",
        color: "danger",
        variant: "flat",
      });
      await fetchData(page);
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteConfirmItems, deleteSubmitting, fetchData, page, preview]);

  const toggleBatchDeleteItem = useCallback((item: GalleryItem) => {
    setBatchDeleteIds((prev) => {
      if (prev.includes(item.id)) {
        return prev.filter((id) => id !== item.id);
      }

      return [...prev, item.id];
    });
  }, []);

  const selectedDeleteCount = batchDeleteIds.length;
  const deleteConfirmCount = deleteConfirmItems.length;

  const openBatchDeleteConfirm = useCallback(() => {
    if (selectedDeleteCount === 0 || deleteSubmitting) return;

    setDeleteConfirmItems(
      items.filter((item) => batchDeleteIds.includes(item.id)),
    );
  }, [batchDeleteIds, deleteSubmitting, items, selectedDeleteCount]);

  const gotoPrev = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const gotoNext = useCallback(() => {
    setPage((prev) => prev + 1);
  }, []);

  const submitShare = useCallback(async () => {
    if (!share || shareSubmitting) return;
    if (shareResult) {
      const copyContent = `分享链接：${shareResult.url}\n密码：${shareResult.password}`;
      const ok = await copyText(copyContent);
      addToast({
        title: ok ? "已复制完整分享信息" : "复制失败",
        color: ok ? "success" : "danger",
        variant: "flat",
      });
      return;
    }
    const trimmedPassword = sharePassword.trim();
    const length = trimmedPassword.length;
    if (length < SHARE_PASSWORD_MIN || length > SHARE_PASSWORD_MAX) {
      addToast({
        title: "分享密码长度不合法",
        description: `请设置 ${SHARE_PASSWORD_MIN}-${SHARE_PASSWORD_MAX} 位密码`,
        color: "warning",
        variant: "flat",
      });
      return;
    }
    setShareSubmitting(true);
    try {
      const res = await api.post<CreateShareResponse>("/share", {
        resourceId: share.id,
        password: trimmedPassword,
        expireTime: shareExpireTime,
        relay: shareRelay,
      });
      const shareUrl = origin
        ? `${origin}/s/${res.code}`
        : `/s/${res.code}`;
      addToast({
        title: "私密分享创建成功",
        description: "可复制分享信息发送给对方",
        color: "success",
        variant: "flat",
      });
      setSharePassword(trimmedPassword);
      setShareResult({
        url: shareUrl,
        code: res.code,
        password: trimmedPassword,
      });
      await fetchData(page);
    } finally {
      setShareSubmitting(false);
    }
  }, [fetchData, origin, page, share, shareRelay, shareResult, sharePassword, shareSubmitting]);

  const deletingIdSet = useMemo(() => {
    if (!deleteSubmitting) return new Set<number>();

    return new Set(deleteConfirmItems.map((item) => item.id));
  }, [deleteConfirmItems, deleteSubmitting]);

  const renderContent = () => {
    if (loading && items.length === 0) {
      return (
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-default-200/80 bg-default-50/40 dark:border-default-100/30 dark:bg-default-50/5">
          <div className="flex items-center gap-3 text-default-500">
            <Spinner color="primary" />
            <span>加载中...</span>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-danger-100 bg-danger-50/50 text-danger-500 dark:border-danger-200/20 dark:bg-danger-100/5">
          <p>加载失败：{error}</p>
          <Button
            color="primary"
            variant="flat"
            onPress={() => fetchData(page)}
          >
            重试
          </Button>
        </div>
      );
    }

    if (!items.length) {
      return (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border border-default-200/80 bg-default-50/40 text-default-500 dark:border-default-100/30 dark:bg-default-50/5">
          <p className="text-sm font-medium">暂无资源</p>
          <p className="text-xs">上传后即可在这里查看你的资源列表</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => {
          const isBatchSelected = batchDeleteIds.includes(item.id);

          return (
            <div
              key={item.id}
              className={clsx(
                "cursor-pointer rounded-2xl border-2 border-transparent focus:outline-none",
                bathDeleteMode && "transition",
                isBatchSelected &&
                  "border-primary shadow-[0_0_0_3px_rgba(0,111,238,0.18)]",
              )}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (bathDeleteMode) {
                  toggleBatchDeleteItem(item);

                  return;
                }

                if (!item.shareCode) {
                  addToast({
                    title: "无法预览",
                    description: "该资源缺少分享短链，无法打开预览",
                    color: "warning",
                    variant: "flat",
                  });

                  return;
                }
                setPreview(item);
              }}
            >
              <GalleryCard
                deleting={deletingIdSet.has(item.id)}
                item={item}
                origin={origin}
                onCopyLink={handleCopy}
                onDelete={(target) => setDeleteConfirmItems([target])}
                onShare={() => setShare(item)}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div>
          <CheckboxGroup
            className="gap-1"
            label=""
            orientation="horizontal"
            value={tagSelected}
            onChange={(values: any) => handleTagChange([...values])}
          >
            {availableTags.map((tag) => (
              <BillCheckbox key={tag} value={tag}>
                {tag}
              </BillCheckbox>
            ))}
          </CheckboxGroup>
        </div>
        <div className="flex items-center gap-3 text-sm text-default-500">
          <Button
            isLoading={loading}
            color="danger"
            isDisabled={deleteSubmitting}
            size="sm"
            variant="flat"
            onPress={() => {
              setBathDeleteMode((prev) => !prev);
            }}
          >
            {bathDeleteMode ? "退出批量删除" : "批量删除"}
          </Button>
          {bathDeleteMode ? (
            <Button
              color="danger"
              isDisabled={selectedDeleteCount === 0 || deleteSubmitting}
              size="sm"
              variant="flat"
              onPress={openBatchDeleteConfirm}
            >
              删除 {selectedDeleteCount} 个
            </Button>

          ) : (<>
            <span>共 {total} 个</span>
            <span>
              第 {Math.min(page, totalPages)} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">每页</span>
              <Select
                aria-label="每页数量"
                className="w-22"
                isDisabled={loading}
                selectedKeys={new Set([String(pageSize)])}
                size="sm"
                onSelectionChange={(keys: any) =>
                  handlePageSizeChange(keys.currentKey)
                }
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={String(size)} textValue={`${size} 条`}>
                    {size} 条
                  </SelectItem>
                ))}
              </Select>
            </div>
            <Button
              isLoading={loading}
              color="primary"
              size="sm"
              variant="flat"
              onPress={() => {
                fetchTags();
                fetchData(page, tagSelected);
              }}
            >
              刷新
            </Button>
          </>)}
        </div>
      </div>

      {renderContent()}

      <div
        className={clsx(
          "flex items-center justify-center gap-3",
          totalPages <= 1 ? "opacity-50" : "",
        )}
      >
        <Button
          isDisabled={page <= 1 || loading}
          size="sm"
          variant="flat"
          onPress={gotoPrev}
        >
          上一页
        </Button>
        <span className="text-sm text-default-600 dark:text-default-400">
          第 {Math.min(page, totalPages)} / {totalPages} 页
        </span>
        <Button
          isDisabled={page >= totalPages || loading}
          size="sm"
          variant="flat"
          onPress={gotoNext}
        >
          下一页
        </Button>
      </div>

      {/* delete confirm modal */}
      <Modal
        isDismissable={!deleteSubmitting}
        isOpen={deleteConfirmCount > 0}
        placement="center"
        size="md"
        onOpenChange={(open: boolean) => {
          if (!open && !deleteSubmitting) {
            setDeleteConfirmItems([]);
          }
        }}
      >
        <ModalContent>
          {(close: () => void) =>
            deleteConfirmCount > 0 ? (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <span className="text-lg font-semibold text-default-900 dark:text-default-50">
                    确认删除
                  </span>
                  <span className="text-sm text-default-500">
                    删除后无法恢复，请确认。
                  </span>
                </ModalHeader>
                <ModalBody>
                  <p className="text-sm text-default-600 dark:text-default-400">
                    {deleteConfirmCount === 1
                      ? `将删除资源：${deleteConfirmItems[0]?.filename}`
                      : `将删除选中的 ${deleteConfirmCount} 个资源。`}
                  </p>
                </ModalBody>
                <ModalFooter>
                  <Button
                    color="default"
                    isDisabled={deleteSubmitting}
                    variant="flat"
                    onPress={close}
                  >
                    取消
                  </Button>
                  <Button
                    color="danger"
                    isLoading={deleteSubmitting}
                    onPress={confirmDelete}
                  >
                    确认删除
                  </Button>
                </ModalFooter>
              </>
            ) : null
          }
        </ModalContent>
      </Modal>

      {/* preview modal */}
      <XModal
        isDismissable={false}
        isOpen={Boolean(preview)}
        placement="center"
        size="4xl"
        onOpenChange={(open: boolean) => !open && setPreview(null)}
        header={<>
          <span className="text-lg font-semibold text-default-900 dark:text-default-50">
            预览
          </span>
          <span className="text-sm text-default-500">
            {preview?.filename}
          </span>
        </>}
        footer={(preview && preview.shareCode) && <>
          <Button
            color="secondary"
            variant="bordered"
            onPress={() =>
              handleCopy(
                origin
                  ? `${origin}/r/${preview.shareCode}`
                  : `/r/${preview.shareCode}`,
              )
            }
          >
            获取原始链接
          </Button>
          <Button
            as="a"
            color="primary"
            download
            href={`/r/${preview.shareCode}`}
            variant="flat"
          >
            下载
          </Button>
          <Button color="default" variant="flat" onPress={() => setPreview(null)}>
            关闭
          </Button>
        </>}
      >
        {preview && preview.shareCode ? (
          <PreviewCore
            className="min-h-[260px] max-h-[470px] w-full"
            filename={preview.filename}
            rawUrl={`/r/${preview.shareCode}`}
            type={inferMediaType(preview.type)}
          />
        ) : (<p className="text-default-500">
          该资源缺少短链信息，请重新生成后再试。
        </p>)}
      </XModal>

      {/* create share modal */}
      <XModal
        isDismissable={false}
        isOpen={Boolean(share)}
        header={<>
          <span className="text-lg font-semibold">
            创建私密分享
          </span>
          <span className="text-sm text-default-500">
            {share?.filename}
          </span>
        </>}
        submitText={shareResult ? "复制" : "创建分享"}
        onSubmit={submitShare}
        onOpenChange={(open: boolean) => !open && setShare(null)}
      >
        <Input
          autoFocus
          isDisabled={shareSubmitting || Boolean(shareResult)}
          label="分享密码 (4-32位)"
          maxLength={SHARE_PASSWORD_MAX}
          minLength={SHARE_PASSWORD_MIN}
          type="text"
          value={sharePassword}
          onValueChange={setSharePassword}
        // endContent={
        //   <Button 
        //     isIconOnly
        //     color="primary"
        //     variant="flat"
        //     isDisabled={shareSubmitting || Boolean(shareResult)}
        //     onPress={() => {
        //       if (shareSubmitting || shareResult) return;
        //       setSharePassword(buidlPwd(6));
        //     }}
        //   >
        //     <Icon width={28} height={28} icon="iconoir:refresh-circle-solid"/>
        //   </Button>
        // }
        />
        <NumberInput
          value={shareDuration}
          onValueChange={(val: number) => {
            setShareDuration(val);
            setShareExpireTime(buildExpireDateTime(val, shareDurationUnit));
          }}
          defaultValue={0}
          minValue={0}
          isDisabled={shareSubmitting || Boolean(shareResult)}
          endContent={
            <div className="flex items-center">
              <label className="sr-only" htmlFor="time-unit">
                Time Unit
              </label>
              <select
                aria-label="Select time unit"
                className="outline-solid outline-transparent border-0 bg-transparent text-default-400 text-small"
                value={shareDurationUnit}
                id="time-unit"
                name="time-unit"
                onChange={(event) => {
                  const nextUnit = event.target.value as ShareDurationUnit;

                  setShareDurationUnit(nextUnit);
                  setShareExpireTime(buildExpireDateTime(shareDuration, nextUnit));
                }}
              >
                <option aria-label="minutes" value="minutes">
                  分钟
                </option>
                <option aria-label="hours" value="hours">
                  小时
                </option>
                <option aria-label="days" value="days">
                  天
                </option>
              </select>
            </div>
          }
          label={"有效期 (为 0 表示永不过期)"}
          placeholder="0"
          className="max-w-[270px]"
        />
        <Input label="过期时间" type="text"
          readOnly
          isDisabled={shareSubmitting || Boolean(shareResult)}
          value={shareExpireTime as unknown as string}
          size="sm" variant="underlined" placeholder="请先在上方输入有效期"
        />
        <Switch
          defaultSelected={false}
          isDisabled={shareSubmitting || Boolean(shareResult)}
          isSelected={shareRelay}
          size="sm"
          onValueChange={setShareRelay}
        >
          {shareRelay ? "开启" : "关闭"}资源加速（适用于使用 S3 时，使用服务器转发文件，仅非 local 存储生效）
        </Switch>
        {shareResult && (
          <Alert
            color="success"
            description={null
            }
            variant="flat"
          >
            <div className="space-y-1 text-sm text-default-600">
              <p className="font-bold">创建私密分享成功</p>
              <p className="break-all">
                链接：
                <span className="text-primary underline cursor-pointer"
                  onClick={async (event) => {
                    const ok = await copyText(shareResult.url);
                    addToast({
                      title: ok ? "已复制分享链接" : "复制失败",
                      color: ok ? "success" : "danger",
                      variant: "flat",
                    });
                  }}
                >{shareResult.url}</span>
              </p>
              <p>密码：{shareResult.password}</p>
            </div>
          </Alert>
        )}
        {/* <XCalendar /> */}
      </XModal>
    </div >
  );
}
